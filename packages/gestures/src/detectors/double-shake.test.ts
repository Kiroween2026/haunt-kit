// Tests for packages/gestures/specs/double-shake.gesture.md. One test per "Fires when" line and one
// property test per "Must NOT fire when" line.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Sample } from "@haunt-kit/protocol";
import { DEFAULT_DOUBLE_SHAKE_CONFIG, createDoubleShakeDetector, doubleShakeDetector } from "./double-shake";
import { catalog } from "../catalog";
import {
  hzArb,
  pulseStream,
  rotatingStream,
  run,
  sample,
  seedArb,
  shakingStream,
  stillStream,
  times,
  unitVecArb,
} from "../testing/streams";

type Burst = { from: number; to: number };

/** Shaking during each burst (ms), calm between. 5 Hz, 30 m/s² along `dir`. */
function bursts(
  hz: number,
  bursts: Burst[],
  seconds: number,
  dir: [number, number, number] = [1, 0, 0],
  seed = 1,
): Sample[] {
  const calm = stillStream({ hz, seconds, seed, noiseA: 0.1 });
  const shaking = shakingStream({ hz, seconds, seed, freqHz: 5, amp: 30, dir });
  return calm.map((c, i) => (bursts.some((b) => c.t >= b.from && c.t < b.to) ? shaking[i]! : c));
}

const two = (pause: number, len = 700): Burst[] => [
  { from: 500, to: 500 + len },
  { from: 500 + len + pause, to: 500 + 2 * len + pause },
];

describe("double-shake: fires when", () => {
  it("two bursts with a 500 ms pause fire once, with the gap", () => {
    const events = run(createDoubleShakeDetector(), bursts(60, two(500), 4));
    expect(events).toHaveLength(1);
    expect(events[0]!.name).toBe("double-shake");
    expect(events[0]!.data!.gapMs).toBeGreaterThan(500);
    expect(events[0]!.data!.gapMs).toBeLessThanOrEqual(2500);
  });

  it("pauses from 350 ms to 1200 ms all work", () => {
    for (const pause of [350, 600, 900, 1200]) {
      expect(run(createDoubleShakeDetector(), bursts(60, two(pause), 5))).toHaveLength(1);
    }
  });

  it("is detected at any sample rate from 30 to 120 Hz, however the phone is held", () => {
    fc.assert(
      fc.property(hzArb, seedArb, unitVecArb, fc.integer({ min: 400, max: 1300 }), (hz, seed, dir, pause) => {
        expect(run(createDoubleShakeDetector(), bursts(hz, two(pause), 5, dir, seed))).toHaveLength(1);
      }),
      { numRuns: 150 },
    );
  });

  it("fires again for a second double shake after the cooldown", () => {
    const b = [...two(500), ...two(500).map((x) => ({ from: x.from + 4000, to: x.to + 4000 }))];
    expect(run(createDoubleShakeDetector(), bursts(60, b, 8))).toHaveLength(2);
  });
});

describe("double-shake: must NOT fire when", () => {
  it("the phone is held still or has only sensor noise", () => {
    fc.assert(
      fc.property(hzArb, seedArb, fc.double({ min: 0, max: 0.2, noNaN: true }), (hz, seed, noiseA) => {
        expect(run(createDoubleShakeDetector(), stillStream({ hz, seed, noiseA, seconds: 8 }))).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("the player shakes once, however long the shake lasts", () => {
    fc.assert(
      fc.property(hzArb, seedArb, unitVecArb, fc.integer({ min: 500, max: 4000 }), (hz, seed, dir, len) => {
        expect(
          run(createDoubleShakeDetector(), bursts(hz, [{ from: 500, to: 500 + len }], 6, dir, seed)),
        ).toEqual([]);
      }),
      { numRuns: 150 },
    );
  });

  it("two bursts have under 300 ms of calm between them (one longer shake)", () => {
    fc.assert(
      fc.property(hzArb, seedArb, fc.integer({ min: 0, max: 200 }), (hz, seed, pause) => {
        expect(run(createDoubleShakeDetector(), bursts(hz, two(pause, 900), 5, [1, 0, 0], seed))).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("the second burst comes more than 2500 ms after the first", () => {
    fc.assert(
      fc.property(hzArb, seedArb, fc.integer({ min: 2300, max: 4000 }), (hz, seed, pause) => {
        // The 700 ms burst ends before the pause; the second is detected > 2500 ms after the first.
        expect(run(createDoubleShakeDetector(), bursts(hz, two(pause), 9, [1, 0, 0], seed))).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("a single flick, spin or slow tilt happens", () => {
    const detector = () => createDoubleShakeDetector();
    expect(run(detector(), pulseStream({ hz: 60, seconds: 2, amp: 30, at: 500, lengthMs: 100 }))).toEqual([]);
    expect(run(detector(), rotatingStream({ hz: 60, seconds: 3, rate: 600 }))).toEqual([]);
    const tilt = times({ hz: 60, seconds: 4 }).map((t) =>
      sample(t, { ay: 9.81 * Math.sin(t / 3000), az: 9.81 * Math.cos(t / 3000) }),
    );
    expect(run(detector(), tilt)).toEqual([]);
  });
});

describe("double-shake: contract", () => {
  it("has the spec's defaults and is in the catalog", () => {
    expect(doubleShakeDetector.defaults).toEqual({
      threshold: 18,
      minPeaks: 3,
      pauseMs: 300,
      windowMs: 2500,
      calmDelta: 4,
      cooldownMs: 1000,
    });
    expect(DEFAULT_DOUBLE_SHAKE_CONFIG).toEqual(doubleShakeDetector.defaults);
    expect(catalog.has("double-shake")).toBe(true);
  });

  it("reset() makes it behave like new, and bad samples are ignored", () => {
    const d = createDoubleShakeDetector();
    const samples = bursts(60, two(500), 4);
    const first = run(d, samples);
    d.reset();
    expect(run(d, samples)).toEqual(first);
    expect(d.push(sample(NaN))).toEqual([]);
  });
});
