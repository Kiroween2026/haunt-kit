import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { Coach } from "./coach";
import { demoPlan, demoSamples } from "./demo";
import { EXERCISES, exerciseById } from "./exercises";
import { memoryHistory, openHistory } from "./history";
import {
  REPORT_NOTE,
  formatDate,
  formatDeg,
  formatDuration,
  formatSec,
  reportText,
  sessionRows,
} from "./report";
import { SteadySession, feedbackFor, phraseFor } from "./session";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  acceptDisclaimer,
  hasAcceptedDisclaimer,
  loadSettings,
  saveSettings,
} from "./settings";
import { createSpeaker, type Speaker } from "./speech";
import { isConsistent, mean, summarize, summarySchema, type RepRecord, type SessionSummary } from "./summary";

const rep = (count: number, over: Partial<RepRecord> = {}): RepRecord => ({
  count,
  romDeg: 85,
  tempoSec: 2.4,
  fullRange: true,
  tooFast: false,
  ...over,
});
const event = (r: RepRecord) => ({
  name: "rep",
  t: r.count * 1000,
  data: {
    count: r.count,
    romDeg: r.romDeg,
    tempoSec: r.tempoSec,
    fullRange: r.fullRange ? 1 : 0,
    tooFast: r.tooFast ? 1 : 0,
  },
});
const shoulder = exerciseById("shoulder-raise")!;

const repArb = fc.record({
  romDeg: fc.double({ min: 0, max: 200, noNaN: true }),
  tempoSec: fc.double({ min: 0, max: 30, noNaN: true }),
  fullRange: fc.boolean(),
  tooFast: fc.boolean(),
});
const summaryArb: fc.Arbitrary<SessionSummary> = fc
  .record({
    id: fc.uuid(),
    exercise: fc.constantFrom("shoulder-raise" as const, "bicep-curl" as const),
    startedAt: fc.integer({ min: 1.6e12, max: 1.9e12 }).map((n) => new Date(n).toISOString()),
    durationSec: fc.double({ min: 0, max: 3600, noNaN: true }),
    detail: fc.array(repArb, { maxLength: 30 }).map((list) => list.map((r, i) => ({ ...r, count: i + 1 }))),
  })
  .map(summarize);

describe("exercises", () => {
  it("have a start angle, a target above the minimum, and a way to hold the phone", () => {
    expect(EXERCISES.map((e) => e.id)).toEqual(["shoulder-raise", "bicep-curl"]);
    for (const e of EXERCISES) {
      expect(e.holding.length).toBeGreaterThan(20);
      expect(e.rep.targetRomDeg!).toBeGreaterThan(e.rep.minRomDeg!);
    }
    expect(exerciseById("nope")).toBeUndefined();
  });
});

describe("feedback", () => {
  it("too fast comes first, then not full range, then a good rep", () => {
    expect(feedbackFor({ fullRange: true, tooFast: true }).kind).toBe("too-fast");
    expect(feedbackFor({ fullRange: false, tooFast: true }).kind).toBe("too-fast");
    expect(feedbackFor({ fullRange: false, tooFast: false }).text).toBe("Not full range");
    expect(feedbackFor({ fullRange: true, tooFast: false })).toEqual({
      kind: "good",
      text: "Good rep",
      spoken: "",
    });
  });
  it("says the count, then the advice", () => {
    expect(phraseFor(3, feedbackFor({ fullRange: true, tooFast: false }))).toBe("3.");
    expect(phraseFor(4, feedbackFor({ fullRange: true, tooFast: true }))).toBe("4. Slow down.");
    expect(phraseFor(5, feedbackFor({ fullRange: false, tooFast: false }))).toBe("5. Go a little higher.");
  });
});

describe("SteadySession", () => {
  it("ignores reps until calibrated, then counts them in order", () => {
    const s = new SteadySession(shoulder, "a");
    expect(s.onEvent(event(rep(1)))).toBeNull();
    expect(s.phase).toBe("calibrating");
    s.onEvent({ name: "rep-calibrated", t: 2000 });
    expect(s.phase).toBe("active");
    const r = s.onEvent(event(rep(1, { tooFast: true })))!;
    expect(r.feedback.kind).toBe("too-fast");
    s.onEvent(event(rep(2)));
    expect(s.count).toBe(2);
    expect(s.reps.map((x) => x.count)).toEqual([1, 2]);
  });

  it("ignores other gestures and anything after it ends", () => {
    const s = new SteadySession(shoulder, "a");
    s.onEvent({ name: "rep-calibrated", t: 0 });
    expect(s.onEvent({ name: "shake", t: 1 })).toBeNull();
    s.end();
    expect(s.onEvent(event(rep(1)))).toBeNull();
    expect(s.count).toBe(0);
  });

  it("times the session from calibration to the end", () => {
    let now = 1_000_000;
    const s = new SteadySession(shoulder, "a", () => now);
    now += 2000;
    s.onEvent({ name: "rep-calibrated", t: 0 });
    now += 45_000;
    const sum = s.end();
    expect(sum.durationSec).toBe(45);
    now += 99_000;
    expect(s.summary().durationSec).toBe(45); // fixed once it has ended
  });

  it("property: the summary always agrees with the reps (totals, averages, counts)", () => {
    fc.assert(
      fc.property(fc.array(repArb, { maxLength: 40 }), (list) => {
        const s = new SteadySession(shoulder, "p");
        s.onEvent({ name: "rep-calibrated", t: 0 });
        list.forEach((r, i) => s.onEvent(event({ ...r, count: i + 1 })));
        const sum = s.end();
        expect(sum.reps).toBe(list.length);
        expect(sum.detail).toHaveLength(list.length);
        expect(isConsistent(sum)).toBe(true);
        expect(summarySchema.safeParse(sum).success).toBe(true);
        if (list.length > 0) {
          expect(sum.avgRomDeg).toBeGreaterThanOrEqual(Math.min(...list.map((r) => r.romDeg)) - 1e-9);
          expect(sum.avgRomDeg).toBeLessThanOrEqual(Math.max(...list.map((r) => r.romDeg)) + 1e-9);
        } else {
          expect(sum.avgRomDeg).toBe(0);
        }
      }),
    );
  });

  it("property: a summary that was changed by hand is noticed", () => {
    fc.assert(
      fc.property(
        summaryArb.filter((s) => s.reps > 0),
        (s) => {
          expect(isConsistent(s)).toBe(true);
          expect(isConsistent({ ...s, reps: s.reps + 1 })).toBe(false);
          expect(isConsistent({ ...s, fullRangeReps: s.reps + 1 })).toBe(false);
        },
      ),
    );
  });
});

describe("history (IndexedDB, on this device)", () => {
  it("saves, lists newest first, removes and clears", async () => {
    const h = openHistory(new IDBFactory());
    const a = summarize({
      id: "a",
      exercise: "shoulder-raise",
      startedAt: "2026-11-01T10:00:00Z",
      durationSec: 30,
      detail: [rep(1)],
    });
    const b = summarize({
      id: "b",
      exercise: "bicep-curl",
      startedAt: "2026-11-03T10:00:00Z",
      durationSec: 40,
      detail: [rep(1), rep(2)],
    });
    await h.save(a);
    await h.save(b);
    expect((await h.list()).map((s) => s.id)).toEqual(["b", "a"]);
    await h.remove("b");
    expect((await h.list()).map((s) => s.id)).toEqual(["a"]);
    await h.clear();
    expect(await h.list()).toEqual([]);
  });

  it("saving the same session twice keeps one copy", async () => {
    const h = openHistory(new IDBFactory());
    const a = summarize({
      id: "a",
      exercise: "shoulder-raise",
      startedAt: "2026-11-01T10:00:00Z",
      durationSec: 30,
      detail: [rep(1)],
    });
    await h.save(a);
    await h.save({ ...a, durationSec: 31 });
    expect(await h.list()).toHaveLength(1);
  });

  it("property: history never loses a saved session, even after closing and reopening the database", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(summaryArb, { selector: (s) => s.id, maxLength: 12 }),
        async (sessions) => {
          const factory = new IDBFactory();
          const first = openHistory(factory);
          for (const s of sessions) await first.save(s);
          const reopened = openHistory(factory); // a new connection, as after a page reload
          const back = await reopened.list();
          expect(back.map((s) => s.id).sort()).toEqual(sessions.map((s) => s.id).sort());
          for (const s of back) expect(s).toEqual(sessions.find((x) => x.id === s.id));
          expect(back.map((s) => Date.parse(s.startedAt))).toEqual(
            [...back.map((s) => Date.parse(s.startedAt))].sort((x, y) => y - x),
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it("skips damaged records instead of failing, and refuses to save a damaged one", async () => {
    const factory = new IDBFactory();
    const h = openHistory(factory);
    const good = summarize({
      id: "good",
      exercise: "shoulder-raise",
      startedAt: "2026-11-01T10:00:00Z",
      durationSec: 1,
      detail: [rep(1)],
    });
    await h.save(good);
    // Put junk straight into the database, as a bug or an old version might.
    const raw = await new Promise<IDBDatabase>((res) => {
      const r = factory.open("steady", 1);
      r.onsuccess = () => res(r.result);
    });
    const tx = raw.transaction("sessions", "readwrite");
    tx.objectStore("sessions").put({ id: "junk", exercise: "yoga" });
    await new Promise((res) => (tx.oncomplete = res));
    expect((await h.list()).map((s) => s.id)).toEqual(["good"]);
    await expect(h.save({ ...good, id: "bad", reps: -1 })).rejects.toThrow();
  });

  it("the in-memory store behaves the same", async () => {
    const h = memoryHistory();
    const a = summarize({
      id: "a",
      exercise: "shoulder-raise",
      startedAt: "2026-11-01T10:00:00Z",
      durationSec: 30,
      detail: [rep(1)],
    });
    await h.save(a);
    expect((await h.list())[0]).toEqual(a);
    await h.remove("a");
    expect(await h.list()).toEqual([]);
  });
});

describe("settings", () => {
  const fake = (value?: string) => {
    const data = new Map<string, string>(value === undefined ? [] : [[SETTINGS_KEY, value]]);
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };
  it("defaults: voice on, everything else off", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      voice: true,
      voiceOnly: false,
      textPercent: 100,
      highContrast: false,
    });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("round-trips", () => {
    const store = fake();
    const s = { voice: false, voiceOnly: true, textPercent: 150 as const, highContrast: true };
    saveSettings(store, s);
    expect(loadSettings(store)).toEqual(s);
  });
  it("property: whatever is in storage, loading gives valid settings (bad fields fall back one by one)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.jsonValue().map((j) => JSON.stringify(j)),
        ),
        (raw) => {
          const s = loadSettings(fake(raw));
          expect([100, 125, 150]).toContain(s.textPercent);
          for (const k of ["voice", "voiceOnly", "highContrast"] as const)
            expect(typeof s[k]).toBe("boolean");
        },
      ),
    );
    expect(loadSettings(fake('{"voice":false,"textPercent":999}'))).toEqual({
      ...DEFAULT_SETTINGS,
      voice: false,
    });
  });
  it("remembers that the disclaimer was accepted", () => {
    const store = fake();
    expect(hasAcceptedDisclaimer(store)).toBe(false);
    acceptDisclaimer(store);
    expect(hasAcceptedDisclaimer(store)).toBe(true);
    expect(hasAcceptedDisclaimer(null)).toBe(false);
    expect(() =>
      saveSettings(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("full");
          },
        },
        DEFAULT_SETTINGS,
      ),
    ).not.toThrow();
  });
});

describe("speech", () => {
  const setup = (enabled = true) => {
    const spoken: { text: string; volume: number }[] = [];
    const synth = {
      speak: (u: { text: string; volume: number }) => void spoken.push({ text: u.text, volume: u.volume }),
      cancel: vi.fn(),
    };
    class U {
      volume = 1;
      rate = 1;
      lang = "";
      constructor(public text: string) {}
    }
    return { spoken, synth, speaker: createSpeaker(synth as never, U as never, () => enabled) };
  };
  it("unlock speaks silently, say cuts off the previous words", () => {
    const { speaker, spoken, synth } = setup();
    speaker.unlock();
    expect(spoken).toEqual([{ text: " ", volume: 0 }]);
    speaker.say("One.");
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken.at(-1)).toEqual({ text: "One.", volume: 1 });
  });
  it("says nothing when voice is off, the text is empty, or speech isn't supported", () => {
    const off = setup(false);
    off.speaker.say("One.");
    expect(off.spoken).toEqual([]);
    const on = setup();
    on.speaker.say("  ");
    expect(on.spoken).toEqual([]);
    const none = createSpeaker(undefined, undefined);
    expect(none.supported).toBe(false);
    expect(() => {
      none.unlock();
      none.say("x");
      none.cancel();
    }).not.toThrow();
  });
});

describe("report", () => {
  const s = summarize({
    id: "r",
    exercise: "shoulder-raise",
    startedAt: "2026-11-18T15:30:00Z",
    durationSec: 95,
    detail: [rep(1, { romDeg: 80 }), rep(2, { romDeg: 61, fullRange: false, tooFast: true, tempoSec: 1 })],
  });
  it("formats the numbers", () => {
    expect(formatDeg(84.6)).toBe("85°");
    expect(formatSec(2.449)).toBe("2.4 s");
    expect(formatDuration(95)).toBe("1 min 35 s");
    expect(formatDuration(8)).toBe("8 s");
    expect(formatDate("2026-11-18T15:30:00Z", "en-US", "UTC")).toBe("Nov 18, 2026, 3:30 PM");
    expect(formatDate("garbage")).toBe("Unknown date");
  });
  it("lists the headline numbers: reps, average range, average tempo, full range, too fast", () => {
    const rows = Object.fromEntries(sessionRows(s).map((r) => [r.label, r.value]));
    expect(rows).toMatchObject({
      Exercise: "Shoulder raise",
      Reps: "2",
      "Average range of motion": "71°",
      "Average time per rep": "1.7 s",
      "Reps with full range": "1 of 2",
      "Reps that were too fast": "1 of 2",
    });
  });
  it("doesn't invent averages when there are no reps", () => {
    const empty = summarize({
      id: "e",
      exercise: "bicep-curl",
      startedAt: "2026-11-18T15:30:00Z",
      durationSec: 5,
      detail: [],
    });
    expect(
      Object.fromEntries(sessionRows(empty).map((r) => [r.label, r.value]))["Average range of motion"],
    ).toBe("n/a");
  });
  it("says it is not a medical device, in every report", () => {
    expect(REPORT_NOTE).toMatch(/not a medical device/i);
    expect(reportText([s])).toContain(REPORT_NOTE);
    expect(reportText([])).toContain(REPORT_NOTE);
  });
});

describe("Coach with the demo person", () => {
  const speakerLog = () => {
    const said: string[] = [];
    const speaker: Speaker = {
      supported: true,
      unlock: () => {},
      say: (t) => void said.push(t),
      cancel: () => {},
    };
    return { said, speaker };
  };

  for (const exercise of EXERCISES) {
    it(`${exercise.name}: counts the five demo reps, and says what's wrong with two of them`, () => {
      const { said, speaker } = speakerLog();
      const coach = new Coach({ exercise, id: "d", speaker, voiceOnly: false });
      const phases = new Set<string>();
      for (const s of demoSamples(exercise)) phases.add(coach.push(s).phase);
      const summary = coach.stop();
      expect(phases).toEqual(new Set(["calibrating", "active"]));
      expect(summary.reps).toBe(demoPlan(exercise).length);
      expect(summary.detail.map((r) => [r.fullRange, r.tooFast])).toEqual([
        [true, false],
        [true, false],
        [false, false], // not high enough
        [false, true], // too fast. A fast rep also reads a little low (smoothing), but "too fast" is the advice given
        [true, false],
      ]);
      expect(said.slice(0, 5)).toEqual(["1.", "2.", "3. Go a little higher.", "4. Slow down.", "5."]);
      expect(said.at(-1)).toMatch(/^Session finished\. 5 reps\. Average range \d+°\.$/);
      expect(isConsistent(summary)).toBe(true);
    });
  }

  it("voice-only mode also speaks the instructions", () => {
    const { said, speaker } = speakerLog();
    const coach = new Coach({ exercise: shoulder, id: "v", speaker, voiceOnly: true });
    coach.begin();
    for (const s of demoSamples(shoulder)) coach.push(s);
    expect(said[0]).toBe("Hold still at the start position for two seconds.");
    expect(said[1]).toBe("Ready. Start your reps.");
  });

  it("with voice-only off, nothing is said before the first rep", () => {
    const { said, speaker } = speakerLog();
    const coach = new Coach({ exercise: shoulder, id: "v", speaker, voiceOnly: false });
    coach.begin();
    for (const s of demoSamples(shoulder).slice(0, 100)) coach.push(s);
    expect(said).toEqual([]);
  });

  it("an empty session says so, and isn't an error", () => {
    const { said, speaker } = speakerLog();
    const coach = new Coach({ exercise: shoulder, id: "z", speaker, voiceOnly: true });
    expect(coach.stop().reps).toBe(0);
    expect(said.at(-1)).toBe("Session finished. No reps were counted.");
  });

  it("the live view shows the angle going up and the calibration filling", () => {
    const { speaker } = speakerLog();
    const coach = new Coach({ exercise: shoulder, id: "w", speaker, voiceOnly: false });
    let maxAngle = 0;
    let sawHalf = false;
    for (const s of demoSamples(shoulder)) {
      const v = coach.push(s);
      maxAngle = Math.max(maxAngle, v.status.angleDeg);
      if (v.phase === "calibrating" && v.status.calibration > 0.4 && v.status.calibration < 0.6)
        sawHalf = true;
    }
    expect(sawHalf).toBe(true);
    expect(maxAngle).toBeGreaterThan(80);
    expect(coach.view()).toMatchObject({ targetDeg: 80, minDeg: 45 });
  });

  it("demo samples are deterministic", () => {
    expect(demoSamples(shoulder)).toEqual(demoSamples(shoulder));
    expect(mean([])).toBe(0);
  });
});
