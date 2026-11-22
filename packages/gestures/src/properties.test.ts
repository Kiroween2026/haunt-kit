// Property-based tests (fast-check) for the invariants in .kiro/specs/gestures/requirements.md.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Sample } from "@haunt-kit/protocol";
import { catalog } from "./catalog";
import { createFlickDetector } from "./detectors/flick";
import { createRepDetector } from "./detectors/rep";
import { createShakeDetector } from "./detectors/shake";
import { createSpinDetector } from "./detectors/spin";
import {
  hzArb,
  pulseStream,
  repStream,
  rotateAccel,
  rotatingStream,
  rotationMatrix,
  run,
  sample,
  seedArb,
  shakingStream,
  stillStream,
  unitVecArb,
} from "./testing/streams";

const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });

describe("Invariant 1: a still or slightly noisy phone never fires shake, flick or spin", () => {
  const still = fc.record({
    hz: hzArb,
    seed: seedArb,
    noiseA: fc.double({ min: 0, max: 0.2, noNaN: true }), // |a - g| < 0.2 m/s²
    noiseG: fc.double({ min: 0, max: 2, noNaN: true }), // |ω| < 2 deg/s
    beta: fc.double({ min: -80, max: 80, noNaN: true }),
    gamma: fc.double({ min: -80, max: 80, noNaN: true }),
  });

  for (const name of ["shake", "flick", "spin", "flip", "scream"] as const) {
    it(`${name} never fires`, () => {
      fc.assert(
        fc.property(still, (o) => {
          const events = run(catalog.create(name), stillStream({ ...o, seconds: 5 }));
          expect(events).toEqual([]);
        }),
        { numRuns: 150 },
      );
    });
  }

  it("rep never counts, even for a long time", () => {
    fc.assert(
      fc.property(still, (o) => {
        const events = run(createRepDetector(), stillStream({ ...o, seconds: 20 }));
        expect(events.filter((e) => e.name === "rep")).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });
});

describe("Invariant 2: shake gives the same result however the phone is rotated (SO(3))", () => {
  it("event times match and intensity is equal after any 3D rotation", () => {
    fc.assert(
      fc.property(
        fc.record({
          hz: hzArb,
          seed: seedArb,
          freqHz: fc.double({ min: 4, max: 7, noNaN: true }),
          amp: fc.double({ min: 25, max: 45, noNaN: true }),
          dir: unitVecArb,
        }),
        angle,
        angle,
        angle,
        (o, rx, ry, rz) => {
          const base = shakingStream({ ...o, seconds: 2 });
          const rotated = rotateAccel(base, rotationMatrix(rx, ry, rz));
          const a = run(createShakeDetector(), base);
          const b = run(createShakeDetector(), rotated);
          expect(b.map((e) => e.t)).toEqual(a.map((e) => e.t));
          a.forEach((e, i) => expect(b[i]!.data!.intensity).toBeCloseTo(e.data!.intensity!, 6));
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Invariant 3: real gestures are detected at any sample rate from 30 to 120 Hz", () => {
  it("shake", () => {
    fc.assert(
      fc.property(
        fc.record({
          hz: hzArb,
          seed: seedArb,
          freqHz: fc.double({ min: 4, max: 7, noNaN: true }),
          amp: fc.double({ min: 25, max: 45, noNaN: true }),
          dir: unitVecArb,
        }),
        (o) => {
          expect(
            run(createShakeDetector(), shakingStream({ ...o, seconds: 2 })).length,
          ).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("spin, in the right direction", () => {
    fc.assert(
      fc.property(
        fc.record({
          hz: hzArb,
          seed: seedArb,
          rate: fc.double({ min: 450, max: 900, noNaN: true }),
          sign: fc.constantFrom(1, -1),
        }),
        (o) => {
          const events = run(
            createSpinDetector(),
            rotatingStream({ ...o, rate: o.rate * o.sign, seconds: 1.2 }),
          );
          expect(events.length).toBeGreaterThanOrEqual(1);
          expect(events[0]!.data!.direction).toBe(o.sign > 0 ? -1 : 1);
          expect(events[0]!.data!.degrees).toBeGreaterThanOrEqual(300);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("flick, to the right", () => {
    fc.assert(
      fc.property(
        fc.record({
          hz: hzArb,
          amp: fc.double({ min: 20, max: 40, noNaN: true }),
          lengthMs: fc.integer({ min: 80, max: 140 }),
        }),
        (o) => {
          const events = run(createFlickDetector(), pulseStream({ ...o, seconds: 1, at: 300 }));
          expect(events.length).toBeGreaterThanOrEqual(1);
          expect(events[0]!.data!.direction).toBe(1);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("rep: N reps count as exactly N at every rate (see invariant 5)", () => {
    fc.assert(
      fc.property(fc.record({ hz: hzArb, reps: fc.integer({ min: 1, max: 6 }) }), (o) => {
        const events = run(
          createRepDetector(),
          repStream({ ...o, seconds: 1, peakDeg: 80, repSec: 2, restSec: 1 }),
        );
        expect(events.filter((e) => e.name === "rep")).toHaveLength(o.reps);
      }),
      { numRuns: 80 },
    );
  });
});

describe("Invariant 4: events happen inside the time range of the input", () => {
  const anySample = fc.record({
    ax: fc.double({ min: -60, max: 60, noNaN: true }),
    ay: fc.double({ min: -60, max: 60, noNaN: true }),
    az: fc.double({ min: -60, max: 60, noNaN: true }),
    gx: fc.double({ min: -900, max: 900, noNaN: true }),
    gy: fc.double({ min: -900, max: 900, noNaN: true }),
    gz: fc.double({ min: -900, max: 900, noNaN: true }),
    alpha: fc.double({ min: 0, max: 360, noNaN: true }),
    beta: fc.double({ min: -180, max: 180, noNaN: true }),
    gamma: fc.double({ min: -90, max: 90, noNaN: true }),
    rms: fc.double({ min: 0, max: 1, noNaN: true }),
  });
  const stream = fc
    .tuple(
      fc.integer({ min: 0, max: 100_000 }),
      fc.array(fc.tuple(fc.integer({ min: 1, max: 60 }), anySample), { minLength: 1, maxLength: 300 }),
    )
    .map(([t0, steps]) => {
      let t = t0;
      return steps.map(([dt, s]): Sample => ({ ...s, t: (t += dt) }));
    });

  for (const name of catalog.list()) {
    it(`${name}: t0 ≤ event.t ≤ tN, and events are in order`, () => {
      fc.assert(
        fc.property(stream, (samples) => {
          const events = run(catalog.create(name), samples);
          const first = samples[0]!.t;
          const last = samples[samples.length - 1]!.t;
          for (const e of events) {
            expect(e.t).toBeGreaterThanOrEqual(first);
            expect(e.t).toBeLessThanOrEqual(last);
            expect(e.name.length).toBeGreaterThan(0);
            for (const v of Object.values(e.data ?? {})) expect(Number.isFinite(v)).toBe(true);
          }
          expect(events.map((e) => e.t)).toEqual([...events.map((e) => e.t)].sort((a, b) => a - b));
        }),
        { numRuns: 60 },
      );
    });
  }
});

describe("Invariant 5: rep counting", () => {
  const reps = fc.record({
    hz: hzArb,
    seed: seedArb,
    reps: fc.integer({ min: 1, max: 12 }),
    peakDeg: fc.double({ min: 78, max: 120, noNaN: true }),
    repSec: fc.double({ min: 1.5, max: 4, noNaN: true }),
    restSec: fc.double({ min: 0.8, max: 2, noNaN: true }),
  });

  it("N synthetic reps with noise count as exactly N, numbered 1..N", () => {
    fc.assert(
      fc.property(reps, (o) => {
        const events = run(createRepDetector(), repStream({ ...o, seconds: 1, noiseA: 0.15 }));
        const counted = events.filter((e) => e.name === "rep");
        expect(counted.map((e) => e.data!.count)).toEqual(Array.from({ length: o.reps }, (_, i) => i + 1));
        for (const e of counted) {
          expect(e.data!.romDeg).toBeGreaterThan(o.peakDeg * 0.8);
          expect(e.data!.romDeg).toBeLessThanOrEqual(o.peakDeg + 3);
          expect(e.data!.fullRange).toBe(1);
        }
      }),
      { numRuns: 120 },
    );
  });

  it("motions below the minimum range never count", () => {
    fc.assert(
      fc.property(
        fc.record({
          hz: hzArb,
          seed: seedArb,
          reps: fc.integer({ min: 1, max: 8 }),
          peakDeg: fc.double({ min: 0, max: 35, noNaN: true }),
          repSec: fc.double({ min: 1, max: 3, noNaN: true }),
        }),
        (o) => {
          const events = run(createRepDetector(), repStream({ ...o, seconds: 1, restSec: 1, noiseA: 0.1 }));
          expect(events.filter((e) => e.name === "rep")).toEqual([]);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("reps between the minimum (45°) and the target (70°) count but are not full range", () => {
    fc.assert(
      fc.property(
        fc.record({
          hz: hzArb,
          seed: seedArb,
          reps: fc.integer({ min: 1, max: 6 }),
          peakDeg: fc.double({ min: 54, max: 62, noNaN: true }),
        }),
        (o) => {
          const counted = run(
            createRepDetector(),
            repStream({ ...o, seconds: 1, repSec: 2, restSec: 1 }),
          ).filter((e) => e.name === "rep");
          expect(counted).toHaveLength(o.reps);
          expect(counted.every((e) => e.data!.fullRange === 0)).toBe(true);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("a rep counts once: holding at the top or jittering doesn't add reps", () => {
    fc.assert(
      fc.property(
        fc.record({ hz: hzArb, seed: seedArb, holdSec: fc.double({ min: 0, max: 4, noNaN: true }) }),
        (o) => {
          // up, hold at 80°, down
          const up = repStream({
            hz: o.hz,
            seconds: 1,
            seed: o.seed,
            reps: 1,
            peakDeg: 80,
            repSec: 1.6,
            restSec: 0,
          });
          const detector = createRepDetector();
          const events = run(detector, up);
          expect(events.filter((e) => e.name === "rep")).toHaveLength(1);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("reps faster than the minimum tempo are flagged tooFast, and slower ones are not", () => {
    fc.assert(
      fc.property(fc.record({ hz: hzArb, repSec: fc.double({ min: 0.5, max: 4, noNaN: true }) }), (o) => {
        const events = run(
          createRepDetector(),
          repStream({ ...o, seconds: 1, reps: 1, peakDeg: 90, restSec: 1 }),
        );
        const rep = events.find((e) => e.name === "rep");
        expect(rep).toBeDefined();
        // The measured time covers the part of the movement above the 10° start line, so it is a bit shorter than repSec.
        if (o.repSec < 1.0) expect(rep!.data!.tooFast).toBe(1);
        if (o.repSec > 2.0) expect(rep!.data!.tooFast).toBe(0);
      }),
      { numRuns: 80 },
    );
  });
});

describe("Every detector: reset() makes it behave like new", () => {
  const streams: [string, Sample[]][] = [
    ["shake", shakingStream({ hz: 60, seconds: 3, freqHz: 5, amp: 30, dir: [1, 0, 0] })],
    ["flick", pulseStream({ hz: 60, seconds: 2, amp: 30, at: 500, lengthMs: 100 })],
    ["spin", rotatingStream({ hz: 60, seconds: 3, rate: 600 })],
    ["rep", repStream({ hz: 60, seconds: 1, reps: 3, peakDeg: 80, repSec: 2, restSec: 1 })],
    [
      "flip",
      [
        ...Array.from({ length: 30 }, (_, i) => sample(i * 20, { az: -9.8 })),
        ...Array.from({ length: 30 }, (_, i) => sample(600 + i * 20, { az: 9.8 })),
      ],
    ],
    ["scream", Array.from({ length: 60 }, (_, i) => sample(i * 20, { rms: i < 40 ? 0.9 : 0 }))],
  ];
  for (const [name, samples] of streams) {
    it(name, () => {
      const d = catalog.create(name);
      const first = run(d, samples);
      expect(first.length).toBeGreaterThan(0);
      d.reset();
      expect(run(d, samples)).toEqual(first);
    });
  }
});
