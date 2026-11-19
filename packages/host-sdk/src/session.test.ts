import { afterEach, describe, expect, it } from "vitest";
import { startNodeRelay, type NodeRelay } from "@haunt-kit/relay/node";
import type { GestureEvent } from "@haunt-kit/protocol";
import {
  GhostPlayer,
  createMockRelay,
  createMockRoom,
  createRoom,
  ghostRecordingSchema,
  synthRecording,
  webSocketTransport,
  type HauntRoom,
  type RoomEvents,
} from "./index";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(10);
  }
}
function record<E extends keyof RoomEvents>(room: HauntRoom, event: E): RoomEvents[E][] {
  const out: RoomEvents[E][] = [];
  room.on(event, (p) => out.push(p));
  return out;
}

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const c of cleanup.splice(0)) await c();
});

describe("createMockRoom", () => {
  it("creates a room with ghost players that stream frames under their own ids", async () => {
    const room = await createMockRoom({ ghosts: [{ name: "Casper" }, { name: "Boo", recording: "shake" }] });
    cleanup.push(() => room.close());
    expect(room.code).toMatch(/^[A-Z]{4}$/);
    expect(room.joinUrl).toContain(`room=${room.code}`);
    expect(room.qrSvg).toMatch(/^<svg/);
    expect(room.players.map((p) => p.name)).toEqual(["Casper", "Boo"]);

    const frames = record(room, "frames");
    await until(() => new Set(frames.map((f) => f.playerId)).size === 2);
    const ids = new Set(room.ghosts.map((g) => g.playerId));
    expect(frames.every((f) => ids.has(f.playerId))).toBe(true);
    expect(frames.every((f) => f.samples.length >= 1 && f.samples.length <= 32)).toBe(true);
  });

  it("delivers ghost gestures and new ghosts as player_joined", async () => {
    const room = await createMockRoom();
    cleanup.push(() => room.close());
    const joined = record(room, "player_joined");
    const gestures = record(room, "gesture");
    const ghost = await room.addGhost({ name: "Late", recording: "still" });
    await until(() => joined.length === 1);
    ghost.gesture("shake", { strength: 2 });
    await until(() => gestures.length === 1);
    expect(gestures[0]).toMatchObject({
      playerId: ghost.playerId,
      event: { name: "shake", data: { strength: 2 } },
    });
  });

  it("the host reconnects after a network drop and keeps its players", async () => {
    const relay = createMockRelay();
    const room = await createRoom({
      relayUrl: relay.relayUrl,
      transport: relay.transport,
      controllerUrl: "https://x.test/",
    });
    cleanup.push(() => room.close());
    await relay.addGhost(room.code, { name: "Stay", recording: "still" });
    await until(() => room.players.length === 1);
    const statuses = record(room, "status");
    const joined = record(room, "player_joined");
    relay.dropAll();
    await until(() => statuses.includes("reconnecting"));
    await until(() => room.status === "connected", 5000);
    // The ghost was dropped too but is still inside its 60 s grace window, so it stays listed.
    expect(room.players.map((p) => p.name)).toEqual(["Stay"]);
    expect(joined).toHaveLength(0);
  });

  it("a non-looping ghost leaves at the end of its recording", async () => {
    const relay = createMockRelay();
    const room = await createRoom({
      relayUrl: relay.relayUrl,
      transport: relay.transport,
      controllerUrl: "https://x.test/",
    });
    cleanup.push(() => room.close());
    const ghost = await relay.addGhost(room.code, {
      name: "Brief",
      recording: synthRecording("still", 0.3),
      loop: false,
    });
    await ghost.finished();
  });
});

describe("Ghost Recordings", () => {
  it("every synthetic recording passes the schema", () => {
    for (const kind of [
      "still",
      "tilt-circle",
      "tilt-left",
      "tilt-right",
      "shake",
      "scream",
      "wander",
    ] as const) {
      expect(ghostRecordingSchema.safeParse(synthRecording(kind)).success).toBe(true);
    }
  });

  it("synthetic recordings are deterministic per seed", () => {
    expect(synthRecording("wander", 1, 30, 7)).toEqual(synthRecording("wander", 1, 30, 7));
    expect(synthRecording("wander", 1, 30, 7)).not.toEqual(synthRecording("wander", 1, 30, 8));
  });
});

describe("over a real Node relay", () => {
  let relay: NodeRelay;

  it("createRoom + a GhostPlayer over real WebSockets", async () => {
    relay = await startNodeRelay({ port: 0 });
    cleanup.push(() => relay.close());
    const room = await createRoom({ relayUrl: relay.wsUrl, controllerUrl: "https://play.test/" });
    cleanup.push(() => room.close());
    expect(room.joinUrl).toBe(`https://play.test/?room=${room.code}`);
    const frames = record(room, "frames");
    const gestures = record(room, "gesture");
    const ghost = new GhostPlayer({
      relayUrl: relay.wsUrl,
      roomCode: room.code,
      name: "Wire",
      recording: synthRecording("tilt-circle"),
      transport: webSocketTransport,
    });
    cleanup.push(() => ghost.stop());
    const id = await ghost.start();
    await until(() => frames.length >= 3);
    ghost.gesture("flick");
    await until(() => gestures.length === 1);
    expect(frames.every((f) => f.playerId === id)).toBe(true);
    expect((gestures[0]!.event as GestureEvent).name).toBe("flick");
    await until(() => room.latencyMs !== null);
  });

  it("createRoom rejects when nothing is listening", async () => {
    await expect(createRoom({ relayUrl: "ws://127.0.0.1:1", timeoutMs: 2000 })).rejects.toThrow();
  });
});
