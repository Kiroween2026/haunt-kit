import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  relayToHost,
  relayToPhone,
  type RelayToHostMessage,
  type RelayToPhoneMessage,
} from "@haunt-kit/protocol";
import {
  CLOSE,
  HOST_GRACE_MS,
  JOIN_TIMEOUT_MS,
  MAX_PLAYERS,
  PLAYER_COLORS,
  PLAYER_GRACE_MS,
  RATE_LIMIT_PER_SECOND,
  Room,
  newRoomState,
  type RoomSocket,
  type SocketMeta,
} from "./room";

const device = { os: "ios" as const, browser: "Safari" };
const sample = (t: number, ax = 0) => ({
  t,
  ax,
  ay: 0,
  az: 9.81,
  gx: 0,
  gy: 0,
  gz: 0,
  alpha: 0,
  beta: 0,
  gamma: 0,
});

class FakeSocket implements RoomSocket {
  readonly key = {};
  sent: string[] = [];
  closedWith: number | null = null;
  constructor(public meta: SocketMeta) {}
  send(text: string) {
    this.sent.push(text);
  }
  close(code: number) {
    this.closedWith = code;
  }
}

class Harness {
  time = 1_000_000;
  sockets = new Set<FakeSocket>();
  room = new Room(newRoomState("ABCD"), { sockets: () => [...this.sockets], now: () => this.time });

  host(): FakeSocket {
    const s = new FakeSocket({ role: "host", authed: false });
    this.sockets.add(s);
    return s;
  }
  phone(): FakeSocket {
    const s = new FakeSocket({ role: "player", playerId: null });
    this.sockets.add(s);
    return s;
  }
  send(s: FakeSocket, m: object) {
    this.room.handleMessage(s, JSON.stringify({ v: 1, ...m }));
  }
  drop(s: FakeSocket) {
    this.room.handleClose(s);
    this.sockets.delete(s);
  }
  /** Moves time forward, firing the alarm whenever it is due. */
  advance(ms: number) {
    const end = this.time + ms;
    for (let next = this.room.nextAlarm(); next !== null && next <= end; next = this.room.nextAlarm()) {
      this.time = Math.max(this.time, next);
      this.room.alarm();
    }
    this.time = end;
  }
  createdHost(): FakeSocket {
    const h = this.host();
    this.send(h, { type: "create_room" });
    return h;
  }
  join(name = "Ana", playerId?: string): FakeSocket {
    const p = this.phone();
    this.send(p, { type: "join", roomCode: "ABCD", name, device, ...(playerId ? { playerId } : {}) });
    return p;
  }
}

const hostMsgs = (s: FakeSocket): RelayToHostMessage[] =>
  s.sent.map((t) => relayToHost.decode(t)).flatMap((r) => (r.ok ? [r.message] : []));
const phoneMsgs = (s: FakeSocket): RelayToPhoneMessage[] =>
  s.sent.map((t) => relayToPhone.decode(t)).flatMap((r) => (r.ok ? [r.message] : []));
const last = <T>(xs: T[]): T => xs[xs.length - 1]!;
const welcomeOf = (p: FakeSocket) => {
  const w = phoneMsgs(p).find((m) => m.type === "welcome");
  if (!w || w.type !== "welcome") throw new Error("no welcome");
  return w;
};

describe("Room: creating and joining", () => {
  it("create_room replies room_ready with a token", () => {
    const h = new Harness();
    const host = h.createdHost();
    const ready = hostMsgs(host)[0];
    expect(ready).toMatchObject({ type: "room_ready", roomCode: "ABCD", players: [] });
    if (ready?.type === "room_ready") expect(ready.hostToken).toHaveLength(32);
  });

  it("a second create_room is not allowed", () => {
    const h = new Harness();
    const host = h.createdHost();
    h.send(host, { type: "create_room" });
    expect(last(hostMsgs(host))).toMatchObject({ type: "error", code: "not_allowed" });
  });

  it("join gets welcome and the host gets player_joined", () => {
    const h = new Harness();
    const host = h.createdHost();
    const phone = h.join("  Casper ");
    const welcome = welcomeOf(phone);
    expect(welcome.color).toBe(PLAYER_COLORS[0]);
    expect(last(hostMsgs(host))).toEqual({
      v: 1,
      type: "player_joined",
      player: { playerId: welcome.playerId, name: "Casper", color: PLAYER_COLORS[0], device },
    });
  });

  it("join before the room exists gets room_not_found and is closed", () => {
    const h = new Harness();
    const phone = h.join();
    expect(last(phoneMsgs(phone))).toMatchObject({ type: "error", code: "room_not_found" });
    expect(phone.closedWith).toBe(CLOSE.roomNotFound);
  });

  it("join with the wrong code gets room_not_found", () => {
    const h = new Harness();
    h.createdHost();
    const p = h.phone();
    h.send(p, { type: "join", roomCode: "WXYZ", name: "A", device });
    expect(last(phoneMsgs(p))).toMatchObject({ type: "error", code: "room_not_found" });
  });

  it(`the ${MAX_PLAYERS + 1}th player gets room_full`, () => {
    const h = new Harness();
    h.createdHost();
    for (let i = 0; i < MAX_PLAYERS; i++) h.join(`P${i}`);
    const extra = h.join("Late");
    expect(last(phoneMsgs(extra))).toMatchObject({ type: "error", code: "room_full" });
    expect(extra.closedWith).toBe(CLOSE.roomFull);
  });

  it("respects maxPlayers from create_room", () => {
    const h = new Harness();
    const host = h.host();
    h.send(host, { type: "create_room", maxPlayers: 2 });
    h.join("A");
    h.join("B");
    expect(last(phoneMsgs(h.join("C")))).toMatchObject({ code: "room_full" });
  });

  it("frames before join are not allowed", () => {
    const h = new Harness();
    const host = h.createdHost();
    const p = h.phone();
    h.send(p, { type: "sensor_frames", samples: [sample(1)] });
    expect(last(phoneMsgs(p))).toMatchObject({ type: "error", code: "not_allowed" });
    expect(hostMsgs(host)).toHaveLength(1);
  });

  it("invalid messages get an error with the decode code", () => {
    const h = new Harness();
    const p = h.phone();
    h.room.handleMessage(p, "{nope");
    expect(last(phoneMsgs(p))).toMatchObject({ type: "error", code: "bad_message" });
    h.room.handleMessage(p, JSON.stringify({ v: 1, type: "room_ready" }));
    expect(last(phoneMsgs(p))).toMatchObject({ type: "error", code: "unknown_type" });
  });

  it("answers ping with pong for both roles", () => {
    const h = new Harness();
    const host = h.createdHost();
    const p = h.join();
    h.send(host, { type: "ping", t: 5 });
    h.send(p, { type: "ping", t: 7 });
    expect(last(hostMsgs(host))).toEqual({ v: 1, type: "pong", t: 5 });
    expect(last(phoneMsgs(p))).toEqual({ v: 1, type: "pong", t: 7 });
  });
});

describe("Room: forwarding", () => {
  it("stamps frames and gestures with the sender's playerId", () => {
    const h = new Harness();
    const host = h.createdHost();
    const p = h.join();
    const id = welcomeOf(p).playerId;
    h.send(p, { type: "sensor_frames", samples: [sample(1)], playerId: "someone-else-123" });
    h.send(p, { type: "gesture", event: { name: "shake", t: 2 } });
    const msgs = hostMsgs(host).slice(-2);
    expect(msgs[0]).toEqual({ v: 1, type: "sensor_frames", playerId: id, samples: [sample(1)] });
    expect(msgs[1]).toEqual({ v: 1, type: "gesture", playerId: id, event: { name: "shake", t: 2 } });
  });

  it("sends ui to one player or to all", () => {
    const h = new Harness();
    const host = h.createdHost();
    const a = h.join("A");
    const b = h.join("B");
    h.send(host, { type: "ui", to: welcomeOf(a).playerId, ui: { view: "tilt" } });
    expect(last(phoneMsgs(a))).toEqual({ v: 1, type: "ui", ui: { view: "tilt" } });
    expect(phoneMsgs(b).some((m) => m.type === "ui")).toBe(false);
    h.send(host, { type: "feedback", to: "all", feedback: { kind: "flash", color: "#ff0000" } });
    expect(last(phoneMsgs(a))).toMatchObject({ type: "feedback" });
    expect(last(phoneMsgs(b))).toMatchObject({ type: "feedback" });
  });

  it("a host that hasn't created or resumed can't send ui", () => {
    const h = new Harness();
    const host = h.host();
    h.send(host, { type: "ui", to: "all", ui: { view: "tilt" } });
    expect(last(hostMsgs(host))).toMatchObject({ type: "error", code: "not_allowed" });
  });
});

describe("Room: rate limiting", () => {
  it(`allows ${RATE_LIMIT_PER_SECOND} messages at once, then drops and warns once per second`, () => {
    const h = new Harness();
    const p = h.phone();
    for (let i = 0; i < RATE_LIMIT_PER_SECOND + 20; i++) h.send(p, { type: "ping", t: i });
    const msgs = phoneMsgs(p);
    expect(msgs.filter((m) => m.type === "pong")).toHaveLength(RATE_LIMIT_PER_SECOND);
    expect(msgs.filter((m) => m.type === "error" && m.code === "rate_limited")).toHaveLength(1);
    h.time += 1000;
    h.send(p, { type: "ping", t: 999 });
    expect(last(phoneMsgs(p))).toEqual({ v: 1, type: "pong", t: 999 });
  });

  it("10 batches per second forever is never limited", () => {
    const h = new Harness();
    h.createdHost();
    const p = h.join();
    for (let i = 0; i < 600; i++) {
      h.time += 100;
      h.send(p, { type: "sensor_frames", samples: [sample(i)] });
    }
    expect(phoneMsgs(p).some((m) => m.type === "error")).toBe(false);
  });
});

describe("Room: reconnects", () => {
  it("a rejoin within 60 s keeps id and color, and the host sees no new player", () => {
    const h = new Harness();
    const host = h.createdHost();
    h.join("A");
    const b = h.join("B");
    const before = welcomeOf(b);
    h.drop(b);
    h.advance(PLAYER_GRACE_MS - 1);
    const b2 = h.join("B", before.playerId);
    expect(welcomeOf(b2)).toEqual(before);
    expect(hostMsgs(host).filter((m) => m.type === "player_joined")).toHaveLength(2);
    h.advance(PLAYER_GRACE_MS * 2);
    expect(hostMsgs(host).some((m) => m.type === "player_left")).toBe(false);
  });

  it("after 60 s the slot is freed and the host gets player_left timeout", () => {
    const h = new Harness();
    const host = h.createdHost();
    const a = h.join("A");
    const id = welcomeOf(a).playerId;
    h.drop(a);
    h.advance(PLAYER_GRACE_MS);
    expect(last(hostMsgs(host))).toEqual({ v: 1, type: "player_left", playerId: id, reason: "timeout" });
    const again = h.join("A", id);
    expect(welcomeOf(again).playerId).not.toBe(id);
  });

  it("a second connection with the same playerId replaces the first", () => {
    const h = new Harness();
    const host = h.createdHost();
    const a = h.join("A");
    const id = welcomeOf(a).playerId;
    const a2 = h.join("A", id);
    expect(a.closedWith).toBe(CLOSE.replaced);
    h.drop(a); // the old socket's late close must not mark the player as gone
    h.advance(PLAYER_GRACE_MS * 2);
    expect(hostMsgs(host).some((m) => m.type === "player_left")).toBe(false);
    h.send(a2, { type: "gesture", event: { name: "tap", t: 1 } });
    expect(last(hostMsgs(host))).toMatchObject({ type: "gesture", playerId: id });
  });

  it("a host can resume with its token within 2 minutes and sees current players", () => {
    const h = new Harness();
    const host = h.createdHost();
    const ready = hostMsgs(host)[0]!;
    if (ready.type !== "room_ready") throw new Error();
    const p = h.join("A");
    h.drop(host);
    h.advance(HOST_GRACE_MS - 1);
    const host2 = h.host();
    h.send(host2, { type: "resume_room", roomCode: "ABCD", hostToken: ready.hostToken });
    expect(hostMsgs(host2)[0]).toMatchObject({
      type: "room_ready",
      players: [{ playerId: welcomeOf(p).playerId }],
    });
    h.advance(HOST_GRACE_MS * 2);
    expect(p.closedWith).toBeNull();
  });

  it("a wrong token is not allowed", () => {
    const h = new Harness();
    const host = h.createdHost();
    h.drop(host);
    const intruder = h.host();
    h.send(intruder, { type: "resume_room", roomCode: "ABCD", hostToken: "x".repeat(32) });
    expect(last(hostMsgs(intruder))).toMatchObject({ type: "error", code: "not_allowed" });
    expect(intruder.closedWith).toBe(CLOSE.notAllowed);
  });

  it("after 2 minutes without the host, phones get room_not_found and the room closes", () => {
    const h = new Harness();
    const host = h.createdHost();
    const p = h.join();
    h.drop(host);
    h.advance(HOST_GRACE_MS);
    expect(last(phoneMsgs(p))).toMatchObject({ type: "error", code: "room_not_found" });
    expect(p.closedWith).toBe(CLOSE.roomNotFound);
    expect(h.room.state.closed).toBe(true);
    expect(h.room.nextAlarm()).toBeNull();
  });
});

// ---------- Property tests ----------

type Op =
  | { kind: "join"; name: number }
  | { kind: "drop"; who: number }
  | { kind: "rejoin"; who: number }
  | { kind: "frame"; who: number; ax: number }
  | { kind: "wait"; ms: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant("join" as const), name: fc.nat(99) }),
  fc.record({ kind: fc.constant("drop" as const), who: fc.nat(20) }),
  fc.record({ kind: fc.constant("rejoin" as const), who: fc.nat(20) }),
  fc.record({ kind: fc.constant("frame" as const), who: fc.nat(20), ax: fc.integer({ min: -50, max: 50 }) }),
  // Short waits, and waits just around the 60 s and 120 s limits, so timeouts really happen.
  fc.record({
    kind: fc.constant("wait" as const),
    ms: fc.oneof(fc.integer({ min: 0, max: 5_000 }), fc.integer({ min: 55_000, max: 130_000 })),
  }),
);
const opsArb = fc.array(opArb, { minLength: 10, maxLength: 80 });
const runs = { numRuns: 400 };

/** Runs random joins, drops, rejoins, frames and waits against one room. */
function simulate(ops: Op[]) {
  const h = new Harness();
  const host = h.createdHost();
  // Every phone that got a welcome: its socket, its id and color, and whether it's open.
  const phones: { socket: FakeSocket; id: string; color: string; open: boolean; droppedAt: number | null }[] =
    [];
  const checks: { rejoinKept: boolean[]; frames: { from: string; ax: number }[] } = {
    rejoinKept: [],
    frames: [],
  };

  const isOpen = (x: (typeof phones)[number]) => x.open && x.socket.closedWith === null;
  for (const op of ops) {
    // A socket the relay closed (e.g. replaced by a rejoin) gets its close event, like a real transport.
    for (const p of phones) {
      if (p.open && p.socket.closedWith !== null) {
        h.drop(p.socket);
        p.open = false;
      }
    }
    if (op.kind === "join") {
      const s = h.join(`P${op.name}`);
      const w = phoneMsgs(s).find((m) => m.type === "welcome");
      if (w?.type === "welcome")
        phones.push({ socket: s, id: w.playerId, color: w.color, open: true, droppedAt: null });
    } else if (op.kind === "drop") {
      const p = phones.filter(isOpen)[op.who % Math.max(1, phones.length)];
      if (p) {
        h.drop(p.socket);
        p.open = false;
        p.droppedAt = h.time;
      }
    } else if (op.kind === "rejoin") {
      const p = phones.filter((x) => !x.open)[op.who % Math.max(1, phones.length)];
      if (p) {
        const withinGrace = p.droppedAt !== null && h.time - p.droppedAt < PLAYER_GRACE_MS;
        const s = h.join("Back", p.id);
        const w = phoneMsgs(s).find((m) => m.type === "welcome");
        if (w?.type === "welcome") {
          if (withinGrace) checks.rejoinKept.push(w.playerId === p.id && w.color === p.color);
          phones.push({ socket: s, id: w.playerId, color: w.color, open: true, droppedAt: null });
        }
        p.droppedAt = null; // this old entry is done
      }
    } else if (op.kind === "frame") {
      const p = phones.filter(isOpen)[op.who % Math.max(1, phones.length)];
      if (p) {
        h.send(p.socket, { type: "sensor_frames", samples: [sample(h.time, op.ax)] });
        checks.frames.push({ from: p.id, ax: op.ax });
      }
    } else {
      h.advance(op.ms);
    }
  }
  return { h, host, checks };
}

describe("Room properties", () => {
  it("players never share a slot or a color, and the room never exceeds the max", () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { h } = simulate(ops);
        const players = h.room.players();
        expect(players.length).toBeLessThanOrEqual(MAX_PLAYERS);
        expect(new Set(players.map((p) => p.slot)).size).toBe(players.length);
        expect(new Set(players.map((p) => p.color)).size).toBe(players.length);
        expect(new Set(players.map((p) => p.playerId)).size).toBe(players.length);
      }),
      runs,
    );
  });

  it("a rejoin within 60 s always keeps the same playerId and color", () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { checks } = simulate(ops);
        expect(checks.rejoinKept.every(Boolean)).toBe(true);
      }),
      runs,
    );
  });

  it("messages never cross players: every frame reaches the host under its sender's id", () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const { host, checks } = simulate(ops);
        const forwarded = hostMsgs(host).flatMap((m) =>
          m.type === "sensor_frames" ? [{ from: m.playerId, ax: m.samples[0]!.ax }] : [],
        );
        expect(forwarded).toEqual(checks.frames);
      }),
      runs,
    );
  });
});

describe("memory relay", () => {
  it("delivers a message sent just before the server closes (like a real WebSocket)", async () => {
    const { createMemoryRelay } = await import("./memory");
    const relay = createMemoryRelay();
    const t = relay.transport("ws://mem/join?room=ZZZZ");
    const got: string[] = [];
    await new Promise<void>((resolve) => {
      t.onopen = () => t.send(JSON.stringify({ v: 1, type: "join", roomCode: "ZZZZ", name: "A", device }));
      t.onmessage = (m) => got.push(m);
      t.onclose = () => resolve();
    });
    expect(got.map((m) => JSON.parse(m).code)).toEqual(["room_not_found"]);
  });
});

describe("join timeout", () => {
  const withSince = (h: Harness, meta: SocketMeta) => {
    const s = new FakeSocket({ ...meta, since: h.time });
    h.sockets.add(s);
    return s;
  };

  it("closes a phone that connects but never joins, after 10 s", () => {
    const h = new Harness();
    h.createdHost();
    const idle = withSince(h, { role: "player", playerId: null });
    h.advance(JOIN_TIMEOUT_MS - 1);
    expect(idle.closedWith).toBeNull();
    h.advance(1);
    expect(idle.closedWith).toBe(CLOSE.joinTimeout);
  });

  it("closes a host connection that never creates or resumes", () => {
    const h = new Harness();
    const idle = withSince(h, { role: "host", authed: false });
    h.advance(JOIN_TIMEOUT_MS);
    expect(idle.closedWith).toBe(CLOSE.joinTimeout);
  });

  it("never closes a phone that joined in time", () => {
    const h = new Harness();
    h.createdHost();
    const p = withSince(h, { role: "player", playerId: null });
    h.send(p, { type: "join", roomCode: "ABCD", name: "A", device });
    h.advance(JOIN_TIMEOUT_MS * 20);
    expect(p.closedWith).toBeNull();
  });
});
