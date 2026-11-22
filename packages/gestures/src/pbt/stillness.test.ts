import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { GestureEvent } from "@haunt-kit/protocol";
import { stillStreamGen } from "./generators";
import { createShakeDetector } from "../detectors/shake";
import { createFlickDetector } from "../detectors/flick";
import { createSpinDetector } from "../detectors/spin";
import { createHoldStillDetector } from "../detectors/hold-still";
import { createRepDetector } from "../detectors/rep";

describe("PBT Invariant 1: Stillness Invariant", () => {
  it("stationary/noisy stream (|a - 9.81| < 0.2, |omega| < 2.0) never triggers shake, flick, or spin", () => {
    fc.assert(
      fc.property(stillStreamGen({ durationMs: 2500 }), (samples) => {
        const shake = createShakeDetector();
        const flick = createFlickDetector();
        const spin = createSpinDetector();

        const shakeEvents: GestureEvent[] = [];
        const flickEvents: GestureEvent[] = [];
        const spinEvents: GestureEvent[] = [];

        for (const s of samples) {
          shakeEvents.push(...shake.push(s));
          flickEvents.push(...flick.push(s));
          spinEvents.push(...spin.push(s));
        }

        expect(shakeEvents).toHaveLength(0);
        expect(flickEvents).toHaveLength(0);
        expect(spinEvents).toHaveLength(0);
      }),
      { numRuns: 50, seed: 10101 },
    );
  });

  it("hold-still activates reliably and never emits hold-still-broken (state: 0)", () => {
    fc.assert(
      fc.property(stillStreamGen({ durationMs: 2500 }), (samples) => {
        const holdStill = createHoldStillDetector({ holdDurationMs: 1200 });
        const events: GestureEvent[] = [];

        for (const s of samples) {
          events.push(...holdStill.push(s));
        }

        // Should emit hold-still (state: 1) once the 1200ms duration has elapsed
        const activatedEvents = events.filter((e) => e.name === "hold-still" && e.data?.state === 1);
        const brokenEvents = events.filter((e) => e.name === "hold-still-broken" || e.data?.state === 0);

        // A 2500ms still stream must activate hold-still
        expect(activatedEvents.length).toBeGreaterThanOrEqual(1);
        // It must NEVER emit broken events on a still stream
        expect(brokenEvents).toHaveLength(0);

        // Temporal causality: all event timestamps bounded by stream timestamps
        const s0 = samples[0]!.t;
        const send = samples[samples.length - 1]!.t;
        for (const e of events) {
          expect(e.t).toBeGreaterThanOrEqual(s0);
          expect(e.t).toBeLessThanOrEqual(send);
        }
      }),
      { numRuns: 40, seed: 20202 },
    );
  });

  it("rep detector rep count remains strictly 0 for stillness/noise", () => {
    fc.assert(
      fc.property(stillStreamGen({ durationMs: 2000 }), (samples) => {
        const rep = createRepDetector();
        const repEvents: GestureEvent[] = [];

        for (const s of samples) {
          repEvents.push(...rep.push(s));
        }

        // Must never count any reps
        for (const e of repEvents) {
          expect(e.data?.count).toBe(0);
          expect(e.data?.fullRange).toBe(0);
        }
      }),
      { numRuns: 40, seed: 30303 },
    );
  });
});
