// Owner: Yadnesh. The Séance MCP tools. Each is a plain async method (easy to test),
// registered on an McpServer by registerSeanceTools().

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GESTURE_DATA_KEY, normalizeRoomCode, type Sample } from "@haunt-kit/protocol";
import {
  GhostPlayer,
  webSocketTransport,
  type GhostRecording,
  type TransportFactory,
} from "@haunt-kit/host-sdk";
import type { AdminClient } from "./admin-client";
import { downsample, snapshot } from "./stats";
import { loadRecording, saveRecording } from "./recordings";

export type SeanceDeps = {
  admin: AdminClient;
  /** ws(s):// URL of the relay, for replayed ghost players. */
  relayWsUrl: string;
  recordingsDir: string;
  transport?: TransportFactory;
  now?: () => Date;
};

const MAX_RECORDING_S = 60;

type Recording = {
  id: string;
  roomCode: string;
  playerId: string;
  label: string;
  startT: number | null;
  os: string;
  browser: string;
};

export class SeanceTools {
  private readonly recordings = new Map<string, Recording>();
  private readonly replays = new Map<string, GhostPlayer>();
  private nextId = 1;

  constructor(private readonly deps: SeanceDeps) {}

  listRooms() {
    return this.deps.admin.listRooms();
  }

  async listDevices(roomCode: string) {
    return this.deps.admin.devices(code(roomCode));
  }

  async getSensorSnapshot(roomCode: string, playerId: string, seconds: number) {
    const samples = await this.deps.admin.samples(code(roomCode), playerId, { seconds });
    if (samples.length === 0) {
      return { ...snapshot([]), note: noSamplesHint };
    }
    return { ...snapshot(samples), samples: downsample(samples, 30) };
  }

  async startRecording(roomCode: string, playerId: string, label: string) {
    const c = code(roomCode);
    const device = (await this.deps.admin.devices(c)).find((d) => d.playerId === playerId);
    if (!device) throw new Error(`No player ${playerId} in room ${c}. Use list_devices.`);
    const id = `rec-${this.nextId++}`;
    this.recordings.set(id, {
      id,
      roomCode: c,
      playerId,
      label,
      startT: device.lastSampleT,
      os: device.device.os,
      browser: device.device.browser,
    });
    return {
      recordingId: id,
      note: `Recording ${device.name}. Do the motion now, then call stop_recording (max ${MAX_RECORDING_S} s).`,
    };
  }

  async stopRecording(recordingId: string) {
    const rec = this.recordings.get(recordingId);
    if (!rec) throw new Error(`Unknown recording ${recordingId}.`);
    this.recordings.delete(recordingId);
    const samples =
      rec.startT === null
        ? await this.deps.admin.samples(rec.roomCode, rec.playerId, { seconds: MAX_RECORDING_S })
        : await this.deps.admin.samples(rec.roomCode, rec.playerId, { sinceT: rec.startT });
    if (samples.length < 2) throw new Error(`Got ${samples.length} samples. ${noSamplesHint}`);
    const t0 = samples[0]!.t;
    const shifted: Sample[] = samples.map((s) => ({ ...s, t: s.t - t0 }));
    const durationMs = shifted[shifted.length - 1]!.t;
    const recording: GhostRecording = {
      meta: {
        label: rec.label,
        os: rec.os,
        browser: rec.browser,
        sampleRateHz: durationMs > 0 ? Math.round(((shifted.length - 1) * 10000) / durationMs) / 10 : 30,
        recordedAt: (this.deps.now?.() ?? new Date()).toISOString(),
      },
      samples: shifted,
    };
    const file = await saveRecording(this.deps.recordingsDir, recording, this.deps.now?.());
    return { file, samples: shifted.length, durationS: durationMs / 1000, stats: snapshot(shifted).axes };
  }

  async replayRecording(roomCode: string, file: string, playerName: string, speed: number, loop: boolean) {
    const recording = await loadRecording(this.deps.recordingsDir, file);
    const ghost = new GhostPlayer({
      relayUrl: this.deps.relayWsUrl,
      roomCode: code(roomCode),
      name: playerName,
      recording,
      speed,
      loop,
      transport: this.deps.transport ?? webSocketTransport,
    });
    const playerId = await ghost.start();
    const replayId = `replay-${this.nextId++}`;
    this.replays.set(replayId, ghost);
    void ghost.finished().then(() => this.replays.delete(replayId));
    const s = recording.samples;
    return {
      replayId,
      playerId,
      samples: s.length,
      durationS: (s[s.length - 1]!.t - s[0]!.t) / 1000 / speed,
      loop,
    };
  }

  stopReplay(replayId: string) {
    const ghost = this.replays.get(replayId);
    if (!ghost) throw new Error(`Unknown replay ${replayId}.`);
    ghost.stop();
    this.replays.delete(replayId);
    return { stopped: replayId };
  }

  async fireGesture(roomCode: string, playerId: string, name: string, data?: Record<string, number>) {
    await this.deps.admin.fireGesture(code(roomCode), playerId, {
      name,
      t: Date.now(),
      ...(data ? { data } : {}),
    });
    return { fired: name, playerId };
  }

  /** Stops every replay (on shutdown). */
  dispose() {
    for (const g of this.replays.values()) g.stop();
    this.replays.clear();
  }
}

const noSamplesHint =
  "No raw samples from this phone. Phones only stream raw data in tilt or scream views, or when the controller is opened with ?raw=1.";

function code(roomCode: string): string {
  const c = normalizeRoomCode(roomCode);
  if (!c) throw new Error(`"${roomCode}" is not a room code (4 letters).`);
  return c;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

async function run(fn: () => unknown): Promise<ToolResult> {
  try {
    const result = await fn();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: (e as Error).message }], isError: true };
  }
}

const roomCode = z.string().describe("4-letter room code, e.g. KRVX");
const playerId = z.string().min(8).max(64).describe("playerId from list_devices");

export function registerSeanceTools(server: McpServer, tools: SeanceTools): void {
  server.registerTool(
    "list_rooms",
    { description: "List open Haunt Kit rooms on the local dev relay.", inputSchema: {} },
    () => run(() => tools.listRooms()),
  );
  server.registerTool(
    "list_devices",
    {
      description:
        "List the phones in a room: playerId, name, os, browser, connected, last sample time, measured sample rate.",
      inputSchema: { roomCode },
    },
    (a) => run(() => tools.listDevices(a.roomCode)),
  );
  server.registerTool(
    "get_sensor_snapshot",
    {
      description:
        "Recent sensor samples from one phone, with min/max/mean/variance per axis and acceleration magnitude. Use before changing any detector threshold.",
      inputSchema: { roomCode, playerId, seconds: z.number().min(0.5).max(60).default(3) },
    },
    (a) => run(() => tools.getSensorSnapshot(a.roomCode, a.playerId, a.seconds)),
  );
  server.registerTool(
    "start_recording",
    {
      description:
        "Start recording one phone's sensor stream. Ask the person to do the motion, then call stop_recording.",
      inputSchema: {
        roomCode,
        playerId,
        label: z.string().min(1).max(60).describe("e.g. shake-hard, shoulder-raise-x5"),
      },
    },
    (a) => run(() => tools.startRecording(a.roomCode, a.playerId, a.label)),
  );
  server.registerTool(
    "stop_recording",
    {
      description: "Stop a recording and save it as a Ghost Recording JSON file in recordings/.",
      inputSchema: { recordingId: z.string() },
    },
    (a) => run(() => tools.stopRecording(a.recordingId)),
  );
  server.registerTool(
    "replay_recording",
    {
      description:
        "Join a room as a fake player that replays a Ghost Recording from recordings/. The game sees it exactly like a real phone.",
      inputSchema: {
        roomCode,
        file: z.string().describe("file name inside recordings/, e.g. shake-hard-ios-20261119-120000.json"),
        playerName: z.string().min(1).max(20).default("Ghost"),
        speed: z.number().min(0.1).max(10).default(1),
        loop: z.boolean().default(false),
      },
    },
    (a) => run(() => tools.replayRecording(a.roomCode, a.file, a.playerName, a.speed, a.loop)),
  );
  server.registerTool(
    "stop_replay",
    { description: "Stop a replayed ghost player.", inputSchema: { replayId: z.string() } },
    (a) => run(() => tools.stopReplay(a.replayId)),
  );
  server.registerTool(
    "fire_gesture",
    {
      description:
        "Send a gesture to the host as if this player made it (e.g. shake, tap). For testing game reactions.",
      inputSchema: {
        roomCode,
        playerId,
        name: z.string().min(1).max(40),
        data: z.record(z.string().regex(GESTURE_DATA_KEY), z.number()).optional(),
      },
    },
    (a) => run(() => tools.fireGesture(a.roomCode, a.playerId, a.name, a.data)),
  );
}
