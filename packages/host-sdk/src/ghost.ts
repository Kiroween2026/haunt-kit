// Owner: Yadnesh. Ghost Recordings: recorded (or synthetic) phone sensor data replayed as a fake player.
//
// TODO(Anish): this is a placeholder. When @haunt-kit/gestures exports its recording schema
// and replay player, switch to those and delete the duplicates here. The file format is the same
// one the iPhone spike downloads: { meta: { label, os, browser, sampleRateHz, recordedAt }, samples }.

import { z } from "zod";
import {
  MAX_SAMPLES_PER_BATCH,
  phoneToRelay,
  relayToPhone,
  sampleSchema,
  type Sample,
} from "@haunt-kit/protocol";
import { relayEndpoint, type Transport, type TransportFactory } from "@haunt-kit/relay/core";

export const ghostRecordingSchema = z.object({
  meta: z.object({
    label: z.string().min(1).max(80),
    os: z.string().max(40),
    browser: z.string().max(40),
    sampleRateHz: z.number().positive(),
    recordedAt: z.string(),
  }),
  samples: z.array(sampleSchema).min(1),
});

export type GhostRecording = z.infer<typeof ghostRecordingSchema>;

export function parseRecording(json: unknown): GhostRecording {
  return ghostRecordingSchema.parse(json);
}

export type SynthKind = "still" | "tilt-circle" | "tilt-left" | "tilt-right" | "shake" | "scream" | "wander";

/**
 * Synthetic recordings for development before real ones exist. Deterministic (seeded),
 * so tests and demos look the same every time.
 */
export function synthRecording(kind: SynthKind, seconds = 5, hz = 30, seed = 1): GhostRecording {
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const samples: Sample[] = [];
  for (let i = 0; i < Math.round(seconds * hz); i++) {
    const t = Math.round((i * 1000) / hz);
    const sec = t / 1000;
    let beta = 0;
    let gamma = 0;
    let ax = rand() * 0.05;
    let ay = rand() * 0.05;
    let az = 9.81 + rand() * 0.05;
    let rms = 0.02 + Math.abs(rand()) * 0.01;
    if (kind === "tilt-circle") {
      beta = 30 * Math.sin(sec * 2);
      gamma = 30 * Math.cos(sec * 2);
    } else if (kind === "tilt-left") gamma = -35;
    else if (kind === "tilt-right") gamma = 35;
    else if (kind === "wander") {
      beta = 25 * Math.sin(sec * 0.9 + seed) + 8 * Math.sin(sec * 3.1);
      gamma = 25 * Math.cos(sec * 0.7 + seed * 2) + 8 * Math.sin(sec * 2.3);
    } else if (kind === "shake") {
      const k = Math.sin(sec * 2 * Math.PI * 6);
      ax += 18 * k;
      ay += 6 * k;
      az += 4 * k;
    } else if (kind === "scream") {
      rms = sec % 3 < 2 ? 0.6 + Math.abs(rand()) * 0.3 : 0.05;
    }
    // Gravity follows the tilt for tilting kinds, so ax/ay/az stay consistent with beta/gamma.
    if (beta !== 0 || gamma !== 0) {
      const b = (beta * Math.PI) / 180;
      const g = (gamma * Math.PI) / 180;
      ax = 9.81 * Math.sin(g) * Math.cos(b);
      ay = -9.81 * Math.sin(b);
      az = 9.81 * Math.cos(g) * Math.cos(b);
    }
    samples.push({ t, ax, ay, az, gx: 0, gy: 0, gz: 0, alpha: 0, beta, gamma, rms: Math.min(1, rms) });
  }
  return {
    meta: {
      label: `synthetic-${kind}`,
      os: "other",
      browser: "synthetic",
      sampleRateHz: hz,
      recordedAt: "synthetic",
    },
    samples,
  };
}

export type GhostOptions = {
  relayUrl: string;
  roomCode: string;
  name: string;
  recording: GhostRecording;
  /** 1 = real time. 2 = twice as fast. */
  speed?: number;
  /** Start again at the end. Default true. */
  loop?: boolean;
  transport: TransportFactory;
};

/**
 * A fake phone. Joins a room over the real protocol and replays a recording at its own timing,
 * so game code can't tell it from a real player.
 */
export class GhostPlayer {
  playerId: string | null = null;
  color: string | null = null;
  private socket: Transport | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly done: Promise<void>;
  private resolveDone!: () => void;

  constructor(private readonly opts: GhostOptions) {
    this.done = new Promise((r) => (this.resolveDone = r));
  }

  /** Joins and starts replaying. Resolves with the playerId once welcomed. */
  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      const t = this.opts.transport(relayEndpoint(this.opts.relayUrl, "join", this.opts.roomCode));
      this.socket = t;
      t.onopen = () =>
        t.send(
          phoneToRelay.encode({
            v: 1,
            type: "join",
            roomCode: this.opts.roomCode,
            name: this.opts.name,
            device: { os: "other", browser: "ghost" },
          }),
        );
      t.onmessage = (text) => {
        const r = relayToPhone.decode(text);
        if (!r.ok) return;
        if (r.message.type === "welcome") {
          this.playerId = r.message.playerId;
          this.color = r.message.color;
          resolve(r.message.playerId);
          this.play(0, 0);
        } else if (r.message.type === "error") {
          reject(new Error(`${r.message.code}: ${r.message.message}`));
        } else if (r.message.type === "ping") {
          t.send(phoneToRelay.encode({ v: 1, type: "pong", t: r.message.t }));
        }
      };
      t.onclose = () => {
        this.stopTimer();
        reject(new Error("ghost connection closed"));
        this.resolveDone();
      };
    });
  }

  /** Sends one gesture as this ghost. */
  gesture(name: string, data?: Record<string, number>): void {
    this.socket?.send(
      phoneToRelay.encode({
        v: 1,
        type: "gesture",
        event: { name, t: Date.now(), ...(data ? { data } : {}) },
      }),
    );
  }

  /** Leaves the room. */
  stop(): void {
    this.stopped = true;
    this.stopTimer();
    this.socket?.close();
  }

  /** Resolves when the ghost has left (end of a non-looping recording, or stop()). */
  finished(): Promise<void> {
    return this.done;
  }

  private stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Sends samples in batches of ~100 ms, waiting by the recording's own timestamps. */
  private play(index: number, loopOffset: number): void {
    if (this.stopped) return;
    const samples = this.opts.recording.samples;
    const speed = this.opts.speed && this.opts.speed > 0 ? this.opts.speed : 1;
    const first = samples[0]!.t;
    if (index >= samples.length) {
      if (this.opts.loop === false) return this.stop();
      const duration = samples[samples.length - 1]!.t - first + 1000 / this.opts.recording.meta.sampleRateHz;
      return this.play(0, loopOffset + duration);
    }
    const start = samples[index]!.t;
    const batch: Sample[] = [];
    let i = index;
    while (i < samples.length && batch.length < MAX_SAMPLES_PER_BATCH && samples[i]!.t - start < 100) {
      batch.push({ ...samples[i]!, t: samples[i]!.t - first + loopOffset });
      i++;
    }
    this.socket?.send(phoneToRelay.encode({ v: 1, type: "sensor_frames", samples: batch }));
    const nextT =
      i < samples.length
        ? samples[i]!.t
        : samples[samples.length - 1]!.t + 1000 / this.opts.recording.meta.sampleRateHz;
    this.timer = setTimeout(() => this.play(i, loopOffset), Math.max(0, (nextT - start) / speed));
  }
}
