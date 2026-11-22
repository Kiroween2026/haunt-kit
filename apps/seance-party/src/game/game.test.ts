import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { BansheeGame, READY_MS, SCREAM_MS, WINDOW_MS, bestWindow, rankPoints } from "./banshee";
import { Bot, DIFFICULTIES, type Difficulty } from "./bots";
import { AWAY_MS, HoldStillGame, MAX_CYCLES, SURVIVOR_BONUS, WARNING_MS } from "./holdStill";
import {
  BOARD_HALF,
  HOVER_MS,
  LETTER_POS,
  LETTER_RADIUS,
  OUIJA_MS,
  OuijaGame,
  WORDS,
  averageTilt,
  letterAt,
} from "./ouija";
import { createRng } from "./rng";
import { ROUNDS, Session, winners } from "./session";
import { NO_INPUT, type Input, type Inputs, type MiniGame, type Player } from "./types";

const players = (n: number, bot = true): Player[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Ghost ${i}`,
    color: "#ffffff",
    bot,
    left: false,
  }));
const inputs = (entries: [string, Partial<Input>][]): Inputs =>
  new Map(entries.map(([id, i]) => [id, { ...NO_INPUT, ...i }]));
const DT = 33;

/** Runs a game with a function that decides every player's input. */
function play(
  game: MiniGame,
  ids: string[],
  decide: (id: string, game: MiniGame) => Partial<Input>,
  maxMs = 400_000,
) {
  for (let t = 0; t < maxMs && !game.done; t += DT)
    game.tick(DT, inputs(ids.map((id) => [id, decide(id, game)])));
}

describe("Ouija board", () => {
  it("has all 26 letters, in two arcs, with no two close enough to be mixed up", () => {
    expect(LETTER_POS.size).toBe(26);
    const all = [...LETTER_POS.entries()];
    for (const [a, pa] of all) {
      for (const [b, pb] of all)
        if (a < b) expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThan(LETTER_RADIUS * 2);
    }
    for (const p of LETTER_POS.values()) {
      expect(Math.abs(p.x)).toBeLessThan(BOARD_HALF);
      expect(Math.abs(p.y)).toBeLessThan(BOARD_HALF);
    }
  });

  it("finds the letter under a point, and only within its radius", () => {
    for (const [letter, p] of LETTER_POS) {
      expect(letterAt(p)).toBe(letter);
      expect(letterAt({ x: p.x + LETTER_RADIUS * 0.5, y: p.y })).toBe(letter);
    }
    expect(letterAt({ x: 0, y: 0.95 })).toBeNull();
  });

  it("every word can be spelled with the letters on the board", () => {
    for (const w of WORDS) for (const c of w) expect(LETTER_POS.has(c)).toBe(true);
  });

  it("property: the averaged tilt always stays inside the board, however many players and whatever they send", () => {
    const tilt = fc.record({
      x: fc.double({ min: -50, max: 50, noNaN: true }),
      y: fc.double({ min: -50, max: 50, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(tilt, { maxLength: 8 }), (tilts) => {
        const avg = averageTilt(tilts);
        expect(Math.abs(avg.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(avg.y)).toBeLessThanOrEqual(1);
      }),
    );
    expect(averageTilt([])).toEqual({ x: 0, y: 0 });
    expect(averageTilt([{ x: NaN, y: Infinity }])).toEqual({ x: 0, y: 0 }); // junk counts as no tilt
  });

  it("property: the planchette never leaves the board", () => {
    const tilt = fc.record({
      x: fc.double({ min: -3, max: 3, noNaN: true }),
      y: fc.double({ min: -3, max: 3, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.array(fc.array(tilt, { minLength: 1, maxLength: 4 }), { minLength: 10, maxLength: 150 }),
        (seed, frames) => {
          const g = new OuijaGame(["a", "b", "c", "d"], createRng(seed));
          for (const f of frames) {
            g.tick(100, inputs(f.map((t, i) => [["a", "b", "c", "d"][i]!, { tilt: t }])));
            expect(Math.abs(g.pos.x)).toBeLessThanOrEqual(BOARD_HALF);
            expect(Math.abs(g.pos.y)).toBeLessThanOrEqual(BOARD_HALF);
          }
        },
      ),
    );
  });

  it("everyone's tilt is averaged: two players pulling opposite ways cancel out", () => {
    const g = new OuijaGame(["a", "b"], createRng(1));
    const start = { ...g.pos };
    for (let i = 0; i < 20; i++)
      g.tick(
        DT,
        inputs([
          ["a", { tilt: { x: 1, y: 0 } }],
          ["b", { tilt: { x: -1, y: 0 } }],
        ]),
      );
    expect(g.pos.x).toBeCloseTo(start.x);
    for (let i = 0; i < 20; i++)
      g.tick(
        DT,
        inputs([
          ["a", { tilt: { x: 1, y: 0 } }],
          ["b", { tilt: { x: 1, y: 0 } }],
        ]),
      );
    expect(g.pos.x).toBeGreaterThan(start.x + 0.1);
  });

  it("resting on a letter for one second picks it; passing over doesn't", () => {
    const g = new OuijaGame(["a"], createRng(2));
    const target = g.target;
    g.pos = { ...LETTER_POS.get(target)! };
    for (let t = 0; t < HOVER_MS - 100; t += DT) g.tick(DT, inputs([["a", {}]]));
    expect(g.index).toBe(0);
    for (let t = 0; t < 200; t += DT) g.tick(DT, inputs([["a", {}]]));
    expect(g.index).toBe(1);
    expect(g.lettersCorrect).toBe(1);
  });

  it("a wrong letter doesn't count, and a letter can't be picked twice without leaving it", () => {
    const g = new OuijaGame(["a"], createRng(3));
    const wrong = [...LETTER_POS.keys()].find((l) => l !== g.target)!;
    g.pos = { ...LETTER_POS.get(wrong)! };
    const events = [];
    for (let t = 0; t < 3500; t += DT) events.push(...g.tick(DT, inputs([["a", {}]])));
    expect(events.filter((e) => e.type === "wrong")).toHaveLength(1); // once, not every second
    expect(g.lettersCorrect).toBe(0);
  });

  it("spelling a whole word scores it and moves on to a new word", () => {
    const g = new OuijaGame(["a"], createRng(4));
    const first = g.word;
    const events = [];
    for (const letter of first) {
      g.pos = { ...LETTER_POS.get(letter)! };
      for (let t = 0; t <= HOVER_MS + 100; t += DT) events.push(...g.tick(DT, inputs([["a", {}]])));
      g.pos = { x: 0, y: 0.95 }; // step off the board between letters (needed for double letters)
      g.tick(DT, inputs([["a", {}]]));
    }
    expect(events.some((e) => e.type === "word" && e.word === first)).toBe(true);
    expect(g.wordsDone).toBe(1);
    expect(g.lettersCorrect).toBe(first.length);
    expect(g.index).toBe(0);
  });

  it("a double letter needs the planchette to step off and come back", () => {
    const g = new OuijaGame(["a"], createRng(1));
    g.word = "BOO";
    g.index = 1; // O is next
    g.pos = { ...LETTER_POS.get("O")! };
    for (let t = 0; t <= HOVER_MS + 100; t += DT) g.tick(DT, inputs([["a", {}]]));
    expect(g.index).toBe(2);
    expect(g.canPickAgain).toBe(false);
    for (let t = 0; t <= 3 * HOVER_MS; t += DT) g.tick(DT, inputs([["a", {}]]));
    expect(g.index).toBe(2); // still resting on the same O: nothing more happens
    g.pos = { x: 0, y: 0.95 };
    g.tick(DT, inputs([["a", {}]]));
    g.pos = { ...LETTER_POS.get("O")! };
    for (let t = 0; t <= HOVER_MS + 100; t += DT) g.tick(DT, inputs([["a", {}]]));
    expect(g.wordsDone).toBe(1);
  });

  it("lasts 60 seconds, and every player gets the team's points", () => {
    const g = new OuijaGame(["a", "b"], createRng(5));
    play(g, ["a", "b"], () => ({}));
    expect(g.elapsedMs).toBeGreaterThanOrEqual(OUIJA_MS);
    expect([...g.points().keys()]).toEqual(["a", "b"]);
  });
});

describe("Hold Still", () => {
  const frozen = (v: boolean) => ({ frozen: v });

  it("moves through away → warning → watching, and tells phones what to do", () => {
    const g = new HoldStillGame(["a"], createRng(1));
    expect(g.phase).toBe("away");
    expect(g.phoneUi().title).toBe("Dance!");
    for (let t = 0; t < AWAY_MS[1] + 100; t += DT) g.tick(DT, inputs([["a", frozen(false)]]));
    expect(g.phase).toBe("warning");
    expect(g.phoneUi().title).toBe("Freeze!");
    for (let t = 0; t < WARNING_MS + 100; t += DT) g.tick(DT, inputs([["a", frozen(true)]]));
    expect(g.phase).toBe("watching");
    expect(g.phoneUi().title).toBe("Don't move!");
  });

  it("a player who isn't frozen when the ghost looks is out; frozen players stay in", () => {
    const g = new HoldStillGame(["a", "b"], createRng(2));
    const events = [];
    while (g.phase !== "watching")
      events.push(
        ...g.tick(
          DT,
          inputs([
            ["a", frozen(g.phase === "warning")],
            ["b", frozen(false)],
          ]),
        ),
      );
    events.push(
      ...g.tick(
        DT,
        inputs([
          ["a", frozen(true)],
          ["b", frozen(false)],
        ]),
      ),
    );
    expect(g.out).toEqual(["b"]);
    expect(g.alive.has("a")).toBe(true);
    expect(events).toContainEqual({ type: "out", playerId: "b" });
  });

  it("staying frozen the whole time earns nothing", () => {
    const g = new HoldStillGame(["a", "b"], createRng(3));
    // a dances while the ghost looks away; b never moves. Both freeze when told.
    play(g, ["a", "b"], (id, game) => ({ frozen: (game as HoldStillGame).phase !== "away" || id === "b" }));
    const pts = g.points();
    expect(pts.get("a")!).toBeGreaterThan(pts.get("b")!);
  });

  it("ends when one ghost is left, and the survivor gets the bonus", () => {
    const g = new HoldStillGame(["a", "b"], createRng(4));
    play(g, ["a", "b"], (id, game) => ({ frozen: id === "a" && (game as HoldStillGame).phase !== "away" }));
    expect(g.done).toBe(true);
    expect([...g.alive]).toEqual(["a"]);
    expect(g.points().get("a")!).toBeGreaterThanOrEqual(SURVIVOR_BONUS);
    expect(g.points().get("b")).toBe(0);
  });

  it("a solo player plays until they go out or survive every round", () => {
    const g = new HoldStillGame(["a"], createRng(5));
    play(g, ["a"], (_id, game) => ({ frozen: (game as HoldStillGame).phase !== "away" }));
    expect(g.cycles).toBe(MAX_CYCLES);
    expect(g.points().get("a")).toBe(MAX_CYCLES);
  });

  it("a player who leaves is out", () => {
    const g = new HoldStillGame(["a", "b"], createRng(6));
    g.forfeit("b");
    expect(g.out).toEqual(["b"]);
  });
});

describe("Banshee Scream-off", () => {
  const samples = (rms: number[], stepMs = 100) => rms.map((r, i) => ({ t: i * stepMs, rms: r }));

  it("scores the loudest average over a two-second stretch", () => {
    expect(bestWindow(samples(Array(40).fill(0.5)))).toBeCloseTo(0.5);
    expect(
      bestWindow(samples([...Array(20).fill(0.1), ...Array(25).fill(0.9), ...Array(20).fill(0.1)])),
    ).toBeCloseTo(0.9);
  });

  it("a short burst is not a sustained scream", () => {
    expect(bestWindow(samples([...Array(30).fill(0), 1, 1, ...Array(30).fill(0)]))).toBeLessThan(0.1);
    expect(bestWindow(samples(Array(10).fill(1)))).toBe(0); // under two seconds of data
  });

  it("property: the best window is between 0 and 1, and never more than the loudest sample", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 120 }), (rms) => {
        const best = bestWindow(samples(rms));
        expect(best).toBeGreaterThanOrEqual(0);
        expect(best).toBeLessThanOrEqual(Math.max(0, ...rms) + 1e-9);
      }),
    );
  });

  it("ranks players: loudest gets the most, ties share, silence gets zero", () => {
    const pts = rankPoints(
      new Map([
        ["a", 0.9],
        ["b", 0.5],
        ["c", 0.5],
        ["d", 0.01],
      ]),
    );
    expect(Object.fromEntries(pts)).toEqual({ a: 4, b: 3, c: 3, d: 0 });
  });

  it("property: points are never negative and the loudest scream earns the most", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 8 }),
        (scores) => {
          const pts = rankPoints(new Map(scores.map((s, i) => [`p${i}`, s])));
          const values = [...pts.values()];
          expect(values.every((v) => v >= 0)).toBe(true);
          const loudest = scores.indexOf(Math.max(...scores));
          expect(pts.get(`p${loudest}`)).toBe(Math.max(...values));
        },
      ),
    );
  });

  it("counts down, listens for 6 seconds, then ends", () => {
    const g = new BansheeGame(["a", "b"]);
    expect(g.phase).toBe("ready");
    expect(g.phoneUi().view).toBe("scream");
    const events = [];
    for (let t = 0; t < READY_MS + SCREAM_MS + 500; t += DT) {
      events.push(
        ...g.tick(
          DT,
          inputs([
            ["a", { rms: g.phase === "scream" ? 0.9 : 0.8 }],
            ["b", { rms: 0.4 }],
          ]),
        ),
      );
    }
    expect(g.done).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["scream-start", "scream-end"]);
    expect(g.scores().get("a")!).toBeGreaterThan(g.scores().get("b")!);
    expect(g.points().get("a")).toBe(2);
    expect(g.points().get("b")).toBe(1);
  });

  it("ignores loudness during the countdown", () => {
    const g = new BansheeGame(["a"]);
    for (let t = 0; t < READY_MS - 200; t += DT) g.tick(DT, inputs([["a", { rms: 1 }]]));
    expect(g.level("a")).toBe(0);
    expect(WINDOW_MS).toBe(2000);
  });
});

describe("Session", () => {
  const run = (s: Session, decide: (s: Session) => Inputs, maxMs = 600_000) => {
    for (let t = 0; t < maxMs && s.phase !== "winner"; t += DT) s.tick(DT, decide(s));
  };
  const idle = () => new Map<string, Input>();

  it("goes through intro, game and results for each of the three rounds, then the winner", () => {
    const s = new Session();
    expect(s.start(players(2), 1)).toBe(true);
    const seen: string[] = [];
    for (let t = 0; t < 600_000 && s.phase !== "winner"; t += DT) {
      s.tick(DT, idle());
      const label = `${s.phase}:${s.kind}`;
      if (seen.at(-1) !== label) seen.push(label);
    }
    expect(seen).toEqual([
      ...ROUNDS.flatMap((k) => [`intro:${k}`, `playing:${k}`, `results:${k}`]),
      "winner:null",
    ]);
  });

  it("needs at least one player", () => {
    expect(new Session().start([], 1)).toBe(false);
  });

  it("starts over after reset, with zero points", () => {
    const s = new Session();
    s.start(players(2), 1);
    run(s, idle);
    s.reset();
    expect(s.phase).toBe("lobby");
    s.start(players(2), 2);
    expect([...s.totals.values()]).toEqual([0, 0]);
  });

  it("winners: highest total among players who stayed; ties share; nobody if all left", () => {
    const ps = players(3);
    expect(
      winners(
        new Map([
          ["p0", 5],
          ["p1", 9],
          ["p2", 9],
        ]),
        ps,
      ),
    ).toEqual(["p1", "p2"]);
    expect(
      winners(
        new Map([
          ["p0", 5],
          ["p1", 9],
          ["p2", 1],
        ]),
        ps.map((p) => (p.id === "p1" ? { ...p, left: true } : p)),
      ),
    ).toEqual(["p0"]);
    expect(
      winners(
        new Map(),
        ps.map((p) => ({ ...p, left: true })),
      ),
    ).toEqual([]);
  });

  it("property: for any scores and any leavers, a player who left never wins, and ties all win", () => {
    const entry = fc.record({ score: fc.integer({ min: 0, max: 30 }), left: fc.boolean() });
    fc.assert(
      fc.property(fc.array(entry, { minLength: 1, maxLength: 8 }), (list) => {
        const ps = list.map((e, i) => ({
          id: `p${i}`,
          name: `G${i}`,
          color: "#fff",
          bot: true,
          left: e.left,
        }));
        const totals = new Map(list.map((e, i) => [`p${i}`, e.score]));
        const won = winners(totals, ps);
        const staying = ps.filter((p) => !p.left);
        for (const id of won) expect(ps.find((p) => p.id === id)!.left).toBe(false);
        expect(won.length > 0).toBe(staying.length > 0);
        if (staying.length > 0) {
          const best = Math.max(...staying.map((p) => totals.get(p.id)!));
          expect(won.sort()).toEqual(
            staying
              .filter((p) => totals.get(p.id) === best)
              .map((p) => p.id)
              .sort(),
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  it("property: a player who left never wins, and nobody's score is ever negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e6 }),
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 200_000 }),
        (seed, n, who, leaveAtMs) => {
          const s = new Session();
          const ps = players(n);
          s.start(ps, seed);
          const bots = new Map(ps.map((p, i) => [p.id, new Bot(DIFFICULTIES[i % 3]!, seed + i)]));
          const leaver = `p${who % n}`;
          let t = 0;
          while (s.phase !== "winner" && t < 600_000) {
            if (t >= leaveAtMs && !s.players.find((p) => p.id === leaver)!.left) s.playerLeft(leaver);
            s.tick(DT, new Map([...bots].map(([id, b]) => [id, b.think(DT, s.game)])));
            t += DT;
          }
          expect(s.phase).toBe("winner");
          for (const v of s.totals.values()) expect(v).toBeGreaterThanOrEqual(0);
          // Only if they really left before the game ended (a short game can finish first).
          if (s.players.find((p) => p.id === leaver)!.left && s.players.some((p) => !p.left)) {
            expect(s.winnerIds).not.toContain(leaver);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("a leaver keeps their points on the board", () => {
    const s = new Session();
    s.start(players(2), 9);
    const bots = [new Bot("spooky", 1), new Bot("spooky", 2)];
    while (s.phase !== "results") s.tick(DT, new Map(bots.map((b, i) => [`p${i}`, b.think(DT, s.game)])));
    const before = s.totals.get("p0")!;
    s.playerLeft("p0");
    expect(s.totals.get("p0")).toBe(before);
  });
});

describe("Bots", () => {
  it("property: a game of only bots always finishes and has a winner (any seed, 1 to 8 bots, any difficulty)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 31 }),
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom<Difficulty | "mixed">("easy", "normal", "spooky", "mixed"),
        (seed, n, level) => {
          const s = new Session();
          const ps = players(n);
          s.start(ps, seed);
          const bots = new Map(
            ps.map((p, i) => [p.id, new Bot(level === "mixed" ? DIFFICULTIES[i % 3]! : level, seed + i)]),
          );
          let t = 0;
          while (s.phase !== "winner" && t < 600_000) {
            s.tick(DT, new Map([...bots].map(([id, b]) => [id, b.think(DT, s.game)])));
            t += DT;
          }
          expect(s.phase).toBe("winner");
          expect(s.winnerIds.length).toBeGreaterThanOrEqual(1);
          expect(t).toBeLessThan(600_000);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("one idle human plus bots still finishes a full game", () => {
    const s = new Session();
    const ps = [
      { ...players(1, false)[0]!, id: "human" },
      ...players(3).map((p, i) => ({ ...p, id: `bot${i}` })),
    ];
    s.start(ps, 7);
    const bots = new Map(ps.slice(1).map((p, i) => [p.id, new Bot("normal", i)]));
    let t = 0;
    while (s.phase !== "winner" && t < 600_000) {
      const inp = new Map([...bots].map(([id, b]) => [id, b.think(DT, s.game)]));
      inp.set("human", NO_INPUT);
      s.tick(DT, inp);
      t += DT;
    }
    expect(s.phase).toBe("winner");
    expect(s.winnerIds).not.toContain("human");
  });

  it("spooky bots spell words on the Ouija board, easy bots do worse", () => {
    const score = (level: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 5; seed++) {
        const g = new OuijaGame(["a", "b", "c"], createRng(seed));
        const bots = ["a", "b", "c"].map((id, i) => [id, new Bot(level, seed * 10 + i)] as const);
        play(g, ["a", "b", "c"], (id) => bots.find(([x]) => x === id)![1].think(DT, g));
        total += g.lettersCorrect;
      }
      return total;
    };
    const spooky = score("spooky");
    const easy = score("easy");
    expect(spooky).toBeGreaterThan(10);
    expect(spooky).toBeGreaterThan(easy);
  });

  it("bots look like people: they take time to react, and some fumble the freeze", () => {
    const outs = (level: Difficulty) => {
      let out = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const g = new HoldStillGame(["a"], createRng(seed));
        const bot = new Bot(level, seed);
        play(g, ["a"], () => bot.think(DT, g));
        if (g.out.length) out++;
      }
      return out;
    };
    expect(outs("easy")).toBeGreaterThan(outs("spooky"));
  });

  it("louder bots win the scream-off more often than quiet ones", () => {
    const g = new BansheeGame(["easy", "spooky"]);
    const bots = { easy: new Bot("easy", 1), spooky: new Bot("spooky", 2) };
    play(g, ["easy", "spooky"], (id) => bots[id as "easy" | "spooky"].think(DT, g));
    expect(g.scores().get("spooky")!).toBeGreaterThan(g.scores().get("easy")!);
  });
});
