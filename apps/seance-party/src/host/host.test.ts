import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import type { Feedback, HauntRoom, PlayerInfo, RoomEvents, UiView } from "@haunt-kit/host-sdk";
import { createMockRoom } from "@haunt-kit/host-sdk";
import { readConfig } from "./connect";
import { DEAD_ZONE, FULL_TILT_DEG, InputTracker, tiltFromSample } from "./inputs";
import { freeBotName, freeColor, PALETTE } from "./palette";
import { Party } from "./party";

const info = (n: number): PlayerInfo => ({
  playerId: `human-${n}-abcdefgh`,
  name: `Human ${n}`,
  color: PALETTE[n]!,
  device: { os: "ios", browser: "Safari" },
});
const sample = (over: object = {}) => ({
  t: 0,
  ax: 0,
  ay: 0,
  az: 9.81,
  gx: 0,
  gy: 0,
  gz: 0,
  alpha: 0,
  beta: 0,
  gamma: 0,
  ...over,
});

/** A room we can drive by hand, recording what the party tells phones. */
function fakeRoom() {
  const handlers = new Map<string, ((p: never) => void)[]>();
  const sentUi: { to: string; ui: UiView }[] = [];
  const sentFeedback: { to: string; feedback: Feedback }[] = [];
  const room = {
    code: "KRVX",
    joinUrl: "https://play.test/?room=KRVX",
    qrSvg: "<svg></svg>",
    players: [] as PlayerInfo[],
    status: "connected" as const,
    latencyMs: 5,
    on: (e: string, h: (p: never) => void) => {
      handlers.set(e, [...(handlers.get(e) ?? []), h]);
      return () => {};
    },
    sendFeedback: (to: string, feedback: Feedback) => void sentFeedback.push({ to, feedback }),
    setUi: (to: string, ui: UiView) => void sentUi.push({ to, ui }),
    close: vi.fn(),
  } as unknown as HauntRoom;
  const emit = <E extends keyof RoomEvents>(e: E, p: RoomEvents[E]) =>
    handlers.get(e)?.forEach((h) => h(p as never));
  return { room, emit, sentUi, sentFeedback };
}

describe("tilt from a sample", () => {
  it("45° is full tilt; right and down are positive; the dead zone ignores a resting phone", () => {
    expect(tiltFromSample({ beta: 45, gamma: 0 })).toEqual({ x: 0, y: 1 });
    expect(tiltFromSample({ beta: 0, gamma: -45 })).toEqual({ x: -1, y: 0 });
    expect(tiltFromSample({ beta: 1, gamma: 1 })).toEqual({ x: 0, y: 0 });
    expect(FULL_TILT_DEG).toBe(45);
    expect(DEAD_ZONE).toBeGreaterThan(0);
  });
  it("property: always inside -1..1, for any numbers, even junk", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e4, max: 1e4 }), fc.double({ min: -1e4, max: 1e4 }), (beta, gamma) => {
        const t = tiltFromSample({ beta, gamma });
        expect(Math.abs(t.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(t.y)).toBeLessThanOrEqual(1);
      }),
    );
    expect(tiltFromSample({ beta: NaN, gamma: Infinity })).toEqual({ x: 0, y: 0 });
  });
});

describe("InputTracker", () => {
  it("takes tilt and loudness from the latest frame", () => {
    const t = new InputTracker();
    t.onFrames("a", [sample({ gamma: 90 }), sample({ gamma: 22.5, beta: -45, rms: 0.4 })]);
    expect(t.input("a")).toMatchObject({ tilt: { x: 0.5, y: -1 }, rms: 0.4, frozen: false });
  });
  it("hold-still freezes and hold-still-broken unfreezes; other gestures change nothing", () => {
    const t = new InputTracker();
    t.onGesture("a", { name: "hold-still", t: 1 });
    expect(t.input("a").frozen).toBe(true);
    t.onGesture("a", { name: "shake", t: 2 });
    expect(t.input("a").frozen).toBe(true);
    t.onGesture("a", { name: "hold-still-broken", t: 3 });
    expect(t.input("a").frozen).toBe(false);
  });
  it("unknown players have no input, and frames can't un-freeze a player", () => {
    const t = new InputTracker();
    expect(t.input("nobody")).toMatchObject({ tilt: { x: 0, y: 0 }, rms: 0, frozen: false });
    t.onGesture("a", { name: "hold-still", t: 1 });
    t.onFrames("a", [sample()]);
    expect(t.input("a").frozen).toBe(true);
    t.resetFrozen();
    expect(t.input("a").frozen).toBe(false);
    t.onFrames("a", []);
  });
});

describe("palette", () => {
  it("gives bots colors and names nobody is using", () => {
    expect(freeColor([PALETTE[0]!, PALETTE[1]!])).toBe(PALETTE[2]);
    expect(freeBotName(["Wisp"])).toBe("Boo");
    expect(
      freeBotName(["Wisp", "Boo", "Casper", "Spooky", "Phantom", "Specter", "Poltergeist", "Banshee"]),
    ).toBe("Ghost 2");
  });
});

describe("config", () => {
  it("reads the relay, the controller and the speed from the URL, and ignores bad values", () => {
    expect(readConfig("?relay=wss://r.test&play=https://p.test/&speed=10&practice=1", {})).toEqual({
      relayUrl: "wss://r.test",
      controllerUrl: "https://p.test/",
      forcePractice: true,
      speed: 10,
    });
    expect(readConfig("?speed=9999", {}).speed).toBe(1);
    expect(readConfig("?speed=abc", {}).speed).toBe(1);
    expect(readConfig("", { VITE_RELAY_URL: "wss://env" }).relayUrl).toBe("wss://env");
  });
});

describe("Party", () => {
  it("lists people who join and tells the new phone to wait", () => {
    const { room, emit, sentUi } = fakeRoom();
    const party = new Party(room, "live", false);
    emit("player_joined", info(0));
    emit("player_joined", info(1));
    emit("player_joined", info(1)); // a repeat changes nothing
    const lobby = party.view().lobby;
    expect(lobby.players.map((p) => p.name)).toEqual(["Human 0", "Human 1"]);
    expect(lobby.code).toBe("KRVX");
    expect(sentUi.at(-1)).toMatchObject({ to: info(1).playerId, ui: { view: "wait" } });
  });

  it("adds bots up to 8 players, with different names and colors, and removes them", () => {
    const { room, emit } = fakeRoom();
    const party = new Party(room, "live", false);
    emit("player_joined", info(0));
    for (let i = 0; i < 7; i++) expect(party.addBot(i % 2 ? "easy" : "spooky")).toBe(true);
    expect(party.addBot("normal")).toBe(false);
    const players = party.view().lobby.players;
    expect(players).toHaveLength(8);
    expect(new Set(players.map((p) => p.name)).size).toBe(8);
    expect(new Set(players.map((p) => p.color)).size).toBe(8);
    party.removeBot(players[1]!.id);
    expect(party.view().lobby.players).toHaveLength(7);
    party.clearBots();
    expect(party.view().lobby.players).toHaveLength(1);
  });

  it("can't start with nobody, and starting tells every phone to read the screen", () => {
    const { room, emit, sentUi } = fakeRoom();
    const party = new Party(room, "live", false);
    expect(party.start()).toBe(false);
    emit("player_joined", info(0));
    expect(party.start()).toBe(true);
    expect(party.view().game.phase).toBe("intro");
    expect(sentUi.at(-1)).toMatchObject({ to: "all", ui: { view: "wait" } });
  });

  it("one human with no input plus bots plays through to a winner, and phones always get the right view", () => {
    const { room, emit, sentUi } = fakeRoom();
    const party = new Party(room, "live", false);
    emit("player_joined", info(0));
    party.addBot("normal");
    party.addBot("spooky");
    party.start();
    const views = new Set<string>();
    for (let t = 0; t < 600_000 && party.view().game.phase !== "winner"; t += 33) {
      party.tick(33);
      views.add(sentUi.at(-1)!.ui.view);
    }
    const game = party.view().game;
    expect(game.phase).toBe("winner");
    expect(game.winners.length).toBeGreaterThan(0);
    expect(views).toEqual(new Set(["wait", "tilt", "still", "scream"]));
    // The UI is only sent when it changes, not 30 times a second.
    expect(sentUi.length).toBeLessThan(120);
  });

  it("a human who leaves mid-game can't win, and play again returns to the lobby with the bots", () => {
    const { room, emit } = fakeRoom();
    const party = new Party(room, "live", false);
    emit("player_joined", info(0));
    party.addBot("spooky");
    party.start();
    emit("player_left", { playerId: info(0).playerId, reason: "left" });
    for (let t = 0; t < 600_000 && party.view().game.phase !== "winner"; t += 33) party.tick(33);
    const game = party.view().game;
    expect(game.winners).not.toContain(info(0).playerId);
    expect(game.winners).toHaveLength(1);
    party.playAgain();
    expect(party.view().game.phase).toBe("lobby");
    expect(party.view().lobby.players.map((p) => p.bot)).toEqual([true]);
  });

  it("someone who joins mid-game waits for the next one", () => {
    const { room, emit, sentUi } = fakeRoom();
    const party = new Party(room, "live", false);
    party.addBot("easy");
    party.start();
    emit("player_joined", info(3));
    expect(sentUi.at(-1)).toMatchObject({ to: info(3).playerId, ui: { title: "Next game" } });
    expect(party.session.players.map((p) => p.id)).not.toContain(info(3).playerId);
  });

  it("tilt from a real phone's frames steers the planchette", () => {
    const { room, emit } = fakeRoom();
    const party = new Party(room, "live", false);
    emit("player_joined", info(0));
    party.start();
    while (party.view().game.kind !== "ouija" || party.view().game.phase !== "playing") party.tick(33);
    const g = () => party.view().game.game;
    const start = (g() as { pos: { x: number } }).pos.x;
    emit("frames", { playerId: info(0).playerId, samples: [sample({ gamma: 45 })] });
    for (let i = 0; i < 20; i++) party.tick(33);
    expect((g() as { pos: { x: number } }).pos.x).toBeGreaterThan(start + 0.1);
  });

  it("works in practice mode with the SDK's mock room, with no relay and no phones", async () => {
    const room = await createMockRoom({ controllerUrl: "https://example.invalid/play" });
    const party = new Party(room, "practice", false);
    party.addBot("easy");
    party.addBot("spooky");
    party.start();
    for (let t = 0; t < 600_000 && party.view().game.phase !== "winner"; t += 33) party.tick(33);
    expect(party.view().game.phase).toBe("winner");
    party.close();
  });
});
