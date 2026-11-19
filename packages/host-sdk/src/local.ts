// Owner: Yadnesh. Local mode: one phone is both the sensor and the screen (Steady). No relay.

import type { Detector, Feedback, PlayerInfo, Target, UiView } from "@haunt-kit/protocol";
import { FrameBatcher, SAMPLE_HZ } from "./device/batcher";
import {
  KeepAwake,
  MicMeter,
  MotionSampler,
  currentDevice,
  requestSensorAccess,
  type SensorAccess,
} from "./device/browser";
import { Emitter } from "./emitter";
import type { HauntRoom, RoomEvents, RoomStatus } from "./session";

export const LOCAL_PLAYER_ID = "local-player";

export type LocalSessionOptions = {
  name?: string;
  /** Ask for the mic too. Default false (Steady doesn't need it). */
  mic?: boolean;
  /** Detectors to run on every sample; their events come out as "gesture". */
  detectors?: Detector<unknown>[];
  color?: string;
};

export type LocalSession = HauntRoom & {
  /** Call from a tap. Asks for permissions, keeps the screen on and starts sampling. */
  start(): Promise<SensorAccess>;
  /** Feedback and ui the app sent. Local apps usually render these themselves. */
  onLocal(
    handler: (e: { kind: "feedback"; feedback: Feedback } | { kind: "ui"; ui: UiView }) => void,
  ): () => void;
};

export function createLocalSession(opts: LocalSessionOptions = {}): LocalSession {
  const events = new Emitter<RoomEvents>();
  const local = new Emitter<{ out: { kind: "feedback"; feedback: Feedback } | { kind: "ui"; ui: UiView } }>();
  const player: PlayerInfo = {
    playerId: LOCAL_PLAYER_ID,
    name: opts.name ?? "You",
    color: opts.color ?? "#ffb86c",
    device: currentDevice(),
  };
  const sampler = new MotionSampler(player.device.os);
  const awake = new KeepAwake();
  const batcher = new FrameBatcher();
  const detectors = (opts.detectors ?? []).map((d) => d.create(d.defaults));
  let mic: MicMeter | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let status: RoomStatus = "connecting";

  const setStatus = (s: RoomStatus) => {
    status = s;
    events.emit("status", s);
  };

  const session: LocalSession = {
    code: "LOCAL",
    joinUrl: "",
    qrSvg: "",
    latencyMs: 0,
    get status() {
      return status;
    },
    get players() {
      return status === "connected" ? [player] : [];
    },
    on: (event, handler) => events.on(event, handler),
    onLocal: (handler) => local.on("out", handler),
    sendFeedback: (_target: Target, feedback: Feedback) => local.emit("out", { kind: "feedback", feedback }),
    setUi: (_target: Target, ui: UiView) => local.emit("out", { kind: "ui", ui }),
    start() {
      // Started synchronously inside the tap (iOS requirement).
      const access = requestSensorAccess({ mic: opts.mic ?? false });
      void awake.enable();
      return access.then((a) => {
        if (a.stream) mic = new MicMeter(a.stream);
        if (a.motion === "granted" || a.motion === "unsupported") {
          sampler.start();
          timer = setInterval(() => {
            const t = performance.now();
            const s = sampler.read(t, mic?.rms());
            if (!s) return;
            for (const d of detectors) {
              for (const event of d.push(s)) events.emit("gesture", { playerId: LOCAL_PLAYER_ID, event });
            }
            const batch = batcher.push(s, t);
            if (batch) events.emit("frames", { playerId: LOCAL_PLAYER_ID, samples: batch });
          }, 1000 / SAMPLE_HZ);
          setStatus("connected");
          events.emit("player_joined", player);
        }
        return a;
      });
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
      sampler.stop();
      awake.disable();
      mic?.close();
      setStatus("closed");
    },
  };
  return session;
}
