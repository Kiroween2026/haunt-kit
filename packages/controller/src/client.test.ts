import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRelay, createRoom, type HauntRoom, type RoomEvents } from "@haunt-kit/host-sdk";
import { PhoneClient, type KeyValue, type PhoneStatus } from "./client";
import { cleanName, isSecure, resolveRelayUrl, roomFromUrl } from "./config";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(10);
  }
}
const memStorage = (): KeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const device = { os: "ios" as const, browser: "Safari" };
const sample = { t: 1, ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0, alpha: 0, beta: 5, gamma: 5 };

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((c) => c()));

async function setup() {
  const relay = createMemoryRelay();
  const room = await createRoom({
    relayUrl: "ws://mem",
    controllerUrl: "https://play.test/",
    transport: relay.transport,
  });
  cleanup.push(() => room.close());
  const phone = (storage = memStorage(), roomCode = room.code) => {
    const c = new PhoneClient({
      relayUrl: "ws://mem",
      roomCode,
      name: "Ana",
      device,
      transport: relay.transport,
      storage,
    });
    const statuses: PhoneStatus[] = [];
    c.on("status", (s) => statuses.push(s));
    cleanup.push(() => c.stop());
    c.start();
    return { c, statuses, storage };
  };
  return { relay, room, phone };
}
function record<E extends keyof RoomEvents>(room: HauntRoom, e: E) {
  const out: RoomEvents[E][] = [];
  room.on(e, (p) => out.push(p));
  return out;
}

describe("PhoneClient", () => {
  it("joins, stores its playerId, and its frames reach the host", async () => {
    const { room, phone } = await setup();
    const frames = record(room, "frames");
    const { c, storage } = phone();
    await until(() => c.status.kind === "joined");
    expect(storage.data.get(PhoneClient.storageKey(room.code))).toBe(c.playerId);
    c.sendFrames([sample]);
    await until(() => frames.length === 1);
    expect(frames[0]).toEqual({ playerId: c.playerId, samples: [sample] });
  });

  it("receives ui and feedback from the host", async () => {
    const { room, phone } = await setup();
    const { c } = phone();
    const uis: unknown[] = [];
    const fbs: unknown[] = [];
    c.on("ui", (u) => uis.push(u));
    c.on("feedback", (f) => fbs.push(f));
    await until(() => c.status.kind === "joined");
    room.setUi("all", { view: "scream", title: "Scream!" });
    room.sendFeedback(c.playerId!, { kind: "flash", color: "#ff0000" });
    await until(() => uis.length === 1 && fbs.length === 1);
    expect(uis[0]).toEqual({ view: "scream", title: "Scream!" });
  });

  it("reconnects after a network drop as the same player, without a new player_joined", async () => {
    const { relay, room, phone } = await setup();
    const { c, statuses } = phone();
    await until(() => c.status.kind === "joined");
    const id = c.playerId;
    const joined = record(room, "player_joined");
    relay.dropAll();
    await until(() => statuses.some((s) => s.kind === "reconnecting"));
    await until(() => c.status.kind === "joined" && room.status === "connected", 6000);
    expect(c.playerId).toBe(id);
    expect(joined).toHaveLength(0);
    expect(room.players).toHaveLength(1);
  });

  it("a reloaded page (new client, same storage) rejoins as the same player", async () => {
    const { phone } = await setup();
    const first = phone();
    await until(() => first.c.status.kind === "joined");
    const id = first.c.playerId;
    first.c.stop();
    const second = phone(first.storage);
    await until(() => second.c.status.kind === "joined");
    expect(second.c.playerId).toBe(id);
  });

  it("fails with room_not_found for a wrong code and stops retrying", async () => {
    const { phone } = await setup();
    const { c, statuses } = phone(memStorage(), "ZZZZ");
    await until(() => c.status.kind === "failed");
    expect(c.status).toMatchObject({ kind: "failed", code: "room_not_found" });
    await wait(700);
    expect(statuses.filter((s) => s.kind === "reconnecting")).toHaveLength(0);
  });

  it("fails with room_full when the room is full", async () => {
    const relay = createMemoryRelay();
    const room = await createRoom({
      relayUrl: "ws://mem",
      controllerUrl: "https://p.test/",
      maxPlayers: 1,
      transport: relay.transport,
    });
    cleanup.push(() => room.close());
    const mk = () => {
      const c = new PhoneClient({
        relayUrl: "ws://mem",
        roomCode: room.code,
        name: "X",
        device,
        transport: relay.transport,
        storage: memStorage(),
      });
      cleanup.push(() => c.stop());
      c.start();
      return c;
    };
    const a = mk();
    await until(() => a.status.kind === "joined");
    const b = mk();
    await until(() => b.status.kind === "failed");
    expect(b.status).toMatchObject({ code: "room_full" });
  });

  it("measures latency", async () => {
    const { phone } = await setup();
    const { c } = phone();
    await until(() => c.latencyMs !== null);
    expect(c.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("config", () => {
  const loc = { search: "", origin: "https://abc.trycloudflare.com" };
  it("defaults the relay to this origin's /relay (dev proxy)", () => {
    expect(resolveRelayUrl(loc)).toBe("https://abc.trycloudflare.com/relay");
  });
  it("prefers ?relay=, then the build-time URL", () => {
    expect(resolveRelayUrl({ ...loc, search: "?relay=wss://r.example" }, "wss://env")).toBe(
      "wss://r.example",
    );
    expect(resolveRelayUrl({ ...loc, search: "?relay=javascript:alert(1)" }, "wss://env")).toBe("wss://env");
  });
  it("reads and cleans the room code", () => {
    expect(roomFromUrl("?room=abcd")).toBe("ABCD");
    expect(roomFromUrl("?room=ab0d")).toBeNull();
    expect(roomFromUrl("")).toBeNull();
  });
  it("knows when sensors are allowed", () => {
    expect(isSecure({ protocol: "https:", hostname: "x.com" })).toBe(true);
    expect(isSecure({ protocol: "http:", hostname: "192.168.1.5" })).toBe(false);
    expect(isSecure({ protocol: "http:", hostname: "localhost" })).toBe(true);
  });
  it("cleans names", () => {
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("  Casper   the  Ghost  ")).toBe("Casper the Ghost");
    expect(cleanName("x".repeat(30))).toHaveLength(20);
  });
});
