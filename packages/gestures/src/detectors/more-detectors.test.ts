import { describe, expect, it } from "vitest";
import { catalog, GestureCatalog } from "../catalog";
import { createFlickDetector, flickDetector } from "./flick";
import { createFlipDetector } from "./flip";
import { createRepDetector, DEFAULT_REP_CONFIG } from "./rep";
import { createScreamDetector } from "./scream";
import { createSpinDetector } from "./spin";
import { createTapDetector, makeTapEvent, tapDetector } from "./tap";
import { repStream, rotatingStream, run, sample, stillStream, times } from "../testing/streams";

const names = (events: { name: string }[]) => events.map((e) => e.name);

describe("flick", () => {
  const flickAlong = (axis: "ax" | "ay" | "az", sign: 1 | -1) =>
    run(
      createFlickDetector(),
      times({ hz: 60, seconds: 1 }).map((t) => {
        const u = (t - 300) / 100;
        return sample(t, {
          [axis]: (axis === "az" ? 9.81 : 0) + (u >= 0 && u <= 1 ? sign * 30 * Math.sin(u * Math.PI) : 0),
        });
      }),
    );

  it.each([
    ["ax", -1, 0],
    ["ax", 1, 1],
    ["ay", 1, 2],
    ["ay", -1, 3],
    ["az", 1, 4],
  ] as const)("a flick along %s (%i) reports direction %i", (axis, sign, direction) => {
    const events = flickAlong(axis, sign);
    expect(events).toHaveLength(1);
    expect(events[0]!.data!.direction).toBe(direction);
    expect(events[0]!.data!.magnitude).toBeGreaterThanOrEqual(8);
  });

  it("waits for the cooldown before the next flick", () => {
    // Two 100 ms pulses, `gap` ms apart, at 60 Hz. The detector fires in the first part of each pulse.
    const twoPulses = (gap: number) =>
      times({ hz: 60, seconds: 2 }).map((t) => {
        const pulse = (at: number) => {
          const u = (t - at) / 100;
          return u >= 0 && u <= 1 ? 30 * Math.sin(u * Math.PI) : 0;
        };
        return sample(t, { ax: pulse(200) + pulse(200 + gap) });
      });
    expect(run(createFlickDetector({ cooldownMs: 500 }), twoPulses(700))).toHaveLength(2);
    expect(run(createFlickDetector({ cooldownMs: 500 }), twoPulses(350))).toHaveLength(1);
    // Without a cooldown, the way down after a pulse counts as another change: that's why the cooldown exists.
    expect(run(createFlickDetector({ cooldownMs: 0 }), twoPulses(350)).length).toBeGreaterThan(2);
  });

  it("ignores non-finite samples and time going backwards", () => {
    const d = flickDetector.create();
    expect(d.push(sample(NaN))).toEqual([]);
    d.push(sample(1000));
    expect(() => d.push(sample(5))).not.toThrow();
  });
});

describe("spin", () => {
  it("fires after 300° and reports direction and degrees", () => {
    const ccw = run(createSpinDetector(), rotatingStream({ hz: 60, seconds: 1, rate: 500 }));
    expect(ccw).toHaveLength(1);
    expect(ccw[0]!.data!.direction).toBe(-1); // positive gz is counter-clockwise
    const cw = run(createSpinDetector(), rotatingStream({ hz: 60, seconds: 1, rate: -500 }));
    expect(cw[0]!.data!.direction).toBe(1);
    expect(cw[0]!.data!.degrees).toBeGreaterThanOrEqual(300);
  });

  it("a slow rotation (200 deg/s, 1.5 s = 300° over more than a second) never fires", () => {
    expect(run(createSpinDetector(), rotatingStream({ hz: 60, seconds: 6, rate: 200 }))).toEqual([]);
  });

  it("rotating back and forth cancels out", () => {
    const samples = times({ hz: 60, seconds: 4 }).map((t) => sample(t, { gz: Math.sin(t / 150) * 600 }));
    expect(run(createSpinDetector(), samples)).toEqual([]);
  });

  it("a long gap in the data doesn't invent rotation", () => {
    const d = createSpinDetector();
    d.push(sample(0, { gz: 800 }));
    expect(d.push(sample(60_000, { gz: 800 }))).toEqual([]); // one 100 ms step at most, not 60 s
  });

  it("keeps spinning: a second spin after the cooldown", () => {
    const events = run(createSpinDetector(), rotatingStream({ hz: 60, seconds: 4, rate: 500 }));
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < events.length; i++)
      expect(events[i]!.t - events[i - 1]!.t).toBeGreaterThanOrEqual(800);
  });
});

describe("flip", () => {
  const az = (list: [number, number][]) =>
    run(
      createFlipDetector(),
      list.map(([t, v]) => sample(t, { az: v })),
    );

  it("needs 200 ms face-down, then reports faceDown 1; and 0 when back up", () => {
    const out = az([
      [0, 9.8],
      [100, -9.8],
      [250, -9.8],
      [310, -9.8],
      [400, 9.8],
      [500, 9.8],
      [620, 9.8],
    ]);
    expect(out.map((e) => [e.t, e.data!.faceDown])).toEqual([
      [310, 1],
      [620, 0],
    ]);
  });

  it("a short flip (under 200 ms) doesn't count", () => {
    expect(
      az([
        [0, 9.8],
        [100, -9.8],
        [200, -9.8],
        [250, 9.8],
        [500, 9.8],
      ]),
    ).toEqual([]);
  });

  it("wobbling between -7 and -3 doesn't flicker", () => {
    const out = az([
      [0, -9],
      [300, -9],
      [400, -5],
      [500, -8],
      [600, -5],
      [900, -5],
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("scream", () => {
  const rms = (list: [number, number][]) =>
    run(
      createScreamDetector(),
      list.map(([t, v]) => sample(t, { rms: v })),
    );
  const loud = (from: number, to: number, v = 0.9, step = 20): [number, number][] =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => [from + i * step, v]);

  it("fires after 300 ms above 0.65 with peak and average", () => {
    const out = rms([[0, 0.1], ...loud(100, 500, 0.8), [520, 0.9]]);
    expect(out).toHaveLength(1);
    expect(out[0]!.t).toBeGreaterThanOrEqual(400);
    expect(out[0]!.data!.peak).toBeCloseTo(0.8);
    expect(out[0]!.data!.average).toBeCloseTo(0.8);
  });

  it("a short shout doesn't count", () => {
    expect(rms([...loud(0, 200), [220, 0.1], [400, 0.1]])).toEqual([]);
  });

  it("fires once per scream, and again only after silence and the cooldown", () => {
    expect(rms(loud(0, 2000))).toHaveLength(1);
    expect(rms([...loud(0, 500), [520, 0.1], ...loud(540, 1000)])).toHaveLength(1); // within 1000 ms cooldown
    expect(rms([...loud(0, 500), [520, 0.1], ...loud(1600, 2100)])).toHaveLength(2);
  });

  it("samples without rms count as silence", () => {
    const d = createScreamDetector();
    expect(
      run(
        d,
        times({ hz: 50, seconds: 2 }).map((t) => sample(t)),
      ),
    ).toEqual([]);
  });
});

describe("tap", () => {
  it("never reads samples, and builds events from touches", () => {
    expect(createTapDetector().push()).toEqual([]);
    expect(tapDetector.name).toBe("tap");
    expect(makeTapEvent(0.25, 0.75, 10)).toEqual({ name: "tap", t: 10, data: { x: 0.25, y: 0.75 } });
  });
  it("keeps x and y inside 0..1", () => {
    expect(makeTapEvent(-3, 9, 0).data).toEqual({ x: 0, y: 1 });
    expect(makeTapEvent(NaN, NaN, 0).data).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("rep", () => {
  it("calibrates after 2 s of stillness, then counts a rep with all its fields", () => {
    const events = run(
      createRepDetector(),
      repStream({ hz: 60, seconds: 1, reps: 2, peakDeg: 90, repSec: 2.4, restSec: 1 }),
    );
    expect(names(events)).toEqual(["rep-calibrated", "rep", "rep"]);
    const rep = events[1]!;
    expect(rep.data).toMatchObject({ count: 1, fullRange: 1, tooFast: 0 });
    expect(rep.data!.romDeg).toBeGreaterThan(80);
    expect(rep.data!.tempoSec).toBeGreaterThan(1.5);
    expect(events[2]!.data!.count).toBe(2);
  });

  it("restarts calibration if the phone moves while calibrating", () => {
    const moving = times({ hz: 60, seconds: 1.5 }).map((t, i) =>
      sample(t, { ay: i % 2 ? 9.81 * Math.sin(0.5) : 0, az: 9.81 * Math.cos(i % 2 ? 0.5 : 0) }),
    );
    const still = stillStream({ hz: 60, seconds: 2.5, t0: 1500 });
    const events = run(createRepDetector(), [...moving, ...still]);
    expect(names(events)).toEqual(["rep-calibrated"]);
    expect(events[0]!.t).toBeGreaterThanOrEqual(1500 + 2000 - 20); // counted from the still part
  });

  it("flags a fast rep and a partial one", () => {
    const fast = run(
      createRepDetector(),
      repStream({ hz: 60, seconds: 1, reps: 1, peakDeg: 90, repSec: 0.9, restSec: 1 }),
    ).find((e) => e.name === "rep");
    expect(fast!.data!.tooFast).toBe(1);
    const partial = run(
      createRepDetector(),
      repStream({ hz: 60, seconds: 1, reps: 1, peakDeg: 55, repSec: 2.5, restSec: 1 }),
    ).find((e) => e.name === "rep");
    expect(partial!.data).toMatchObject({ fullRange: 0, tooFast: 0 });
  });

  it("works however the phone is held: the angle is measured from the start position", () => {
    // Start with the phone on its side (gravity along +x), then turn it around the z axis.
    const base = repStream({ hz: 60, seconds: 1, reps: 3, peakDeg: 80, repSec: 2, restSec: 1 });
    const sideways = base.map((s) => ({ ...s, ax: s.az, az: -s.ax }));
    expect(run(createRepDetector(), sideways).filter((e) => e.name === "rep")).toHaveLength(3);
  });

  it("uses documented defaults", () => {
    expect(DEFAULT_REP_CONFIG).toMatchObject({
      minRomDeg: 45,
      hysteresisDeg: 10,
      minTempoSec: 1.2,
      calibrationMs: 2000,
    });
  });

  it("ignores free fall (no gravity direction)", () => {
    expect(
      run(
        createRepDetector(),
        times({ hz: 60, seconds: 3 }).map((t) => sample(t, { ax: 0, ay: 0, az: 0.1 })),
      ),
    ).toEqual([]);
  });
});

describe("catalog", () => {
  it("has all ten detectors", () => {
    expect(catalog.list().sort()).toEqual([
      "double-shake",
      "flick",
      "flip",
      "hold-still",
      "rep",
      "scream",
      "shake",
      "spin",
      "tap",
      "tilt",
    ]);
  });
  it("creates detectors with defaults merged with overrides", () => {
    const d = catalog.create("shake", { threshold: 100 });
    expect(
      run(d, [
        sample(0, { ax: 30 }),
        sample(60, { ax: -30 }),
        sample(120, { ax: 30 }),
        sample(180, { ax: -30 }),
      ]),
    ).toEqual([]);
  });
  it("explains an unknown name", () => {
    expect(() => catalog.create("wave")).toThrow(/Unknown gesture "wave". Known: tilt/);
  });
  it("lets apps register their own gesture", () => {
    const c = new GestureCatalog().register(flickDetector);
    expect(c.has("flick")).toBe(true);
    expect(c.get("nope")).toBeUndefined();
  });
});
