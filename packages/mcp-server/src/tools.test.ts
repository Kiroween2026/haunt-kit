import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startNodeRelay, type NodeRelay } from "@haunt-kit/relay/node";
import {
  GhostPlayer,
  createRoom,
  ghostRecordingSchema,
  synthRecording,
  webSocketTransport,
  type HauntRoom,
  type RoomEvents,
} from "@haunt-kit/host-sdk";
import { AdminClient } from "./admin-client";
import { SeanceTools, registerSeanceTools } from "./tools";
import { axisStats, downsample } from "./stats";
import { recordingFileName, safeRecordingPath } from "./recordings";

const TOKEN = "seance-test-token-0123456789";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(10);
  }
}

let relay: NodeRelay;
let room: HauntRoom;
let ghost: GhostPlayer;
let dir: string;
let client: Client;
let tools: SeanceTools;
const events: {
  joined: RoomEvents["player_joined"][];
  gestures: RoomEvents["gesture"][];
  frames: RoomEvents["frames"][];
} = {
  joined: [],
  gestures: [],
  frames: [],
};

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as {
    content: { text: string }[];
    isError?: boolean;
  };
  const text = r.content[0]!.text;
  if (r.isError) throw new Error(text);
  return JSON.parse(text);
}

beforeAll(async () => {
  relay = await startNodeRelay({ port: 0, devToken: TOKEN });
  dir = await mkdtemp(join(tmpdir(), "seance-"));
  room = await createRoom({ relayUrl: relay.wsUrl, controllerUrl: "https://p.test/" });
  room.on("player_joined", (p) => events.joined.push(p));
  room.on("gesture", (g) => events.gestures.push(g));
  room.on("frames", (f) => events.frames.push(f));
  ghost = new GhostPlayer({
    relayUrl: relay.wsUrl,
    roomCode: room.code,
    name: "Tilter",
    recording: synthRecording("tilt-circle", 5),
    transport: webSocketTransport,
  });
  await ghost.start();
  await wait(600); // let some frames reach the relay's sample buffer

  tools = new SeanceTools({
    admin: new AdminClient(relay.url, TOKEN),
    relayWsUrl: relay.wsUrl,
    recordingsDir: dir,
  });
  const server = new McpServer({ name: "seance", version: "test" });
  registerSeanceTools(server, tools);
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
});

afterAll(async () => {
  tools.dispose();
  ghost.stop();
  room.close();
  await client.close();
  await relay.close();
  await rm(dir, { recursive: true, force: true });
});

describe("Séance MCP over the MCP protocol", () => {
  it("exposes every tool", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "fire_gesture",
        "get_sensor_snapshot",
        "list_devices",
        "list_rooms",
        "replay_recording",
        "start_recording",
        "stop_recording",
        "stop_replay",
      ].sort(),
    );
  });

  it("list_rooms and list_devices see the live room and phone", async () => {
    const rooms = await call("list_rooms");
    expect(rooms).toEqual([expect.objectContaining({ code: room.code, players: 1, hostConnected: true })]);
    const devices = await call("list_devices", { roomCode: room.code.toLowerCase() });
    expect(devices[0]).toMatchObject({ playerId: ghost.playerId, name: "Tilter", connected: true });
    expect(devices[0].sampleRateHz).toBeGreaterThan(20);
  });

  it("get_sensor_snapshot returns stats that match the motion (tilt circle of ±30°)", async () => {
    const snap = await call("get_sensor_snapshot", {
      roomCode: room.code,
      playerId: ghost.playerId,
      seconds: 3,
    });
    expect(snap.count).toBeGreaterThan(5);
    expect(snap.axes.beta.max).toBeLessThanOrEqual(30.0001);
    expect(snap.axes.beta.min).toBeGreaterThanOrEqual(-30.0001);
    expect(snap.axes.accelMagnitude.mean).toBeCloseTo(9.81, 1);
    expect(snap.samples.length).toBeLessThanOrEqual(30);
  });

  it("start_recording + stop_recording saves a valid Ghost Recording", async () => {
    const { recordingId } = await call("start_recording", {
      roomCode: room.code,
      playerId: ghost.playerId,
      label: "Tilt Circle!",
    });
    await wait(700);
    const saved = await call("stop_recording", { recordingId });
    expect(saved.file).toMatch(/^seance-[^/]+\/tilt-circle-other-\d{8}-\d{6}\.json$/);
    expect(saved.samples).toBeGreaterThan(10);
    const json = JSON.parse(await readFile(join(dir, saved.file.split("/")[1]), "utf8"));
    expect(ghostRecordingSchema.safeParse(json).success).toBe(true);
    expect(json.samples[0].t).toBe(0);
    expect(json.meta.sampleRateHz).toBeGreaterThan(20);
  });

  it("replay_recording joins as a new player that streams the file", async () => {
    await writeFile(join(dir, "shake.json"), JSON.stringify(synthRecording("shake", 1)));
    const before = events.frames.length;
    const r = await call("replay_recording", {
      roomCode: room.code,
      file: "shake.json",
      playerName: "Replay",
      speed: 2,
    });
    await until(() => events.joined.some((p) => p.name === "Replay"));
    await until(() => events.frames.slice(before).some((f) => f.playerId === r.playerId));
    const shaking = events.frames.filter((f) => f.playerId === r.playerId).flatMap((f) => f.samples);
    expect(Math.max(...shaking.map((s) => Math.abs(s.ax)))).toBeGreaterThan(10);
    await call("stop_replay", { replayId: r.replayId });
  });

  it("fire_gesture reaches the host as that player", async () => {
    await call("fire_gesture", {
      roomCode: room.code,
      playerId: ghost.playerId,
      name: "shake",
      data: { strength: 3 },
    });
    await until(() => events.gestures.length > 0);
    expect(events.gestures.at(-1)).toMatchObject({
      playerId: ghost.playerId,
      event: { name: "shake", data: { strength: 3 } },
    });
  });

  it("refuses files outside recordings/", async () => {
    await expect(
      call("replay_recording", { roomCode: room.code, file: "../../etc/passwd.json" }),
    ).rejects.toThrow(/inside/);
  });

  it("explains a bad token without revealing any token", async () => {
    const bad = new SeanceTools({
      admin: new AdminClient(relay.url, "wrong-token-but-long-enough"),
      relayWsUrl: relay.wsUrl,
      recordingsDir: dir,
    });
    const err = await bad.listRooms().then(
      () => null,
      (e: Error) => e.message,
    );
    expect(err).toMatch(/401/);
    expect(err).not.toContain("wrong-token");
    expect(err).not.toContain(TOKEN);
  });

  it("explains a missing token", async () => {
    const none = new SeanceTools({
      admin: new AdminClient(relay.url, undefined),
      relayWsUrl: relay.wsUrl,
      recordingsDir: dir,
    });
    await expect(none.listRooms()).rejects.toThrow(/pnpm dev:token/);
  });
});

describe("stats and files", () => {
  it("axisStats: min ≤ mean ≤ max and variance ≥ 0, for any numbers", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 300 }),
        (xs) => {
          const s = axisStats(xs)!;
          expect(s.min).toBeLessThanOrEqual(s.mean + 1e-6);
          expect(s.mean).toBeLessThanOrEqual(s.max + 1e-6);
          expect(s.variance).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("axisStats of a constant stream has zero variance", () => {
    expect(axisStats([9.81, 9.81, 9.81])).toEqual({ min: 9.81, max: 9.81, mean: 9.81, variance: 0 });
  });

  it("downsample keeps order, the last item, and the size limit", () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 500 }), fc.integer({ min: 2, max: 50 }), (xs, max) => {
        const d = downsample(xs, max);
        expect(d.length).toBe(Math.min(xs.length, max));
        if (xs.length > 0) expect(d.at(-1)).toBe(xs.at(-1));
      }),
    );
  });

  it("safeRecordingPath blocks traversal and non-json files", () => {
    expect(() => safeRecordingPath("/r", "../x.json")).toThrow();
    expect(() => safeRecordingPath("/r", "/etc/x.json")).toThrow();
    expect(() => safeRecordingPath("/r", "x.txt")).toThrow();
    expect(safeRecordingPath("/r", "a/b.json")).toBe("/r/a/b.json");
  });

  it("recordingFileName makes safe names", () => {
    expect(recordingFileName("Shake HARD!!", "ios", new Date("2026-11-19T12:34:56Z"))).toBe(
      "shake-hard-ios-20261119-123456.json",
    );
    expect(recordingFileName("../../evil", "ios", new Date("2026-11-19T12:34:56Z"))).toBe(
      "evil-ios-20261119-123456.json",
    );
  });
});
