import { describe, expect, it } from "vitest";
import type { Sample } from "@haunt-kit/protocol";
import { DEFAULT_TILT_CONFIG, createTiltDetector, tiltDetector } from "./tilt";
import tableFlatRecording from "../../../../recordings/ghost-recording-table-flat-2026-11-17T17-28-41-306Z.json";

function makeSample(overrides: Partial<Sample> = {}): Sample {
  return {
    t: 100,
    ax: 0,
    ay: 0,
    az: 9.81,
    gx: 0,
    gy: 0,
    gz: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
    ...overrides,
  };
}

describe("Tilt Detector (Task 2.1)", () => {
  describe("Detector contract and default configuration", () => {
    it("conforms to the Detector contract metadata", () => {
      expect(tiltDetector.name).toBe("tilt");
      expect(tiltDetector.defaults).toEqual({
        maxRollDeg: 45,
        maxPitchDeg: 45,
        deadZone: 0.08,
        smoothingFactor: 0.2,
      });
      expect(DEFAULT_TILT_CONFIG).toEqual(tiltDetector.defaults);
    });

    it("creates detector instances with create() and createTiltDetector()", () => {
      const instance1 = tiltDetector.create();
      expect(typeof instance1.push).toBe("function");
      expect(typeof instance1.reset).toBe("function");

      const instanceWithDefaults = tiltDetector.create(tiltDetector.defaults);
      expect(typeof instanceWithDefaults.push).toBe("function");
      expect(typeof instanceWithDefaults.reset).toBe("function");

      const instance2 = createTiltDetector();
      expect(typeof instance2.push).toBe("function");
      expect(typeof instance2.reset).toBe("function");
    });
  });

  describe("Basic normalization and coordinates", () => {
    it("produces (0, 0) for neutral orientation (beta: 0, gamma: 0)", () => {
      const detector = createTiltDetector({ smoothingFactor: 0 });
      const events = detector.push(makeSample({ t: 10, beta: 0, gamma: 0 }));

      expect(events).toHaveLength(1);
      expect(events[0]!.name).toBe("tilt");
      expect(events[0]!.t).toBe(10);
      expect(events[0]!.data).toEqual({ x: 0, y: 0 });
    });

    it("normalizes roll (gamma) to x in range -1.0 to 1.0", () => {
      const detector = createTiltDetector({ smoothingFactor: 0 });

      // Roll right: gamma = +45 -> x = 1.0
      const rightEvents = detector.push(makeSample({ gamma: 45, beta: 0 }));
      expect(rightEvents[0]!.data?.x).toBeCloseTo(1.0);
      expect(rightEvents[0]!.data?.y).toBe(0);

      // Roll left: gamma = -45 -> x = -1.0
      const leftEvents = detector.push(makeSample({ gamma: -45, beta: 0 }));
      expect(leftEvents[0]!.data?.x).toBeCloseTo(-1.0);
      expect(leftEvents[0]!.data?.y).toBe(0);
    });

    it("normalizes pitch (beta) to y in range -1.0 to 1.0", () => {
      const detector = createTiltDetector({ smoothingFactor: 0 });

      // Pitch back / up: beta = +45 -> y = 1.0
      const upEvents = detector.push(makeSample({ beta: 45, gamma: 0 }));
      expect(upEvents[0]!.data?.x).toBe(0);
      expect(upEvents[0]!.data?.y).toBeCloseTo(1.0);

      // Pitch forward / down: beta = -45 -> y = -1.0
      const downEvents = detector.push(makeSample({ beta: -45, gamma: 0 }));
      expect(downEvents[0]!.data?.x).toBe(0);
      expect(downEvents[0]!.data?.y).toBeCloseTo(-1.0);
    });

    it("normalizes intermediate values proportionally", () => {
      const detector = createTiltDetector({ smoothingFactor: 0, deadZone: 0 });

      // gamma = 22.5 deg (half of 45) -> x = 0.5
      // beta = -22.5 deg (half of -45) -> y = -0.5
      const events = detector.push(makeSample({ gamma: 22.5, beta: -22.5 }));
      expect(events[0]!.data?.x).toBeCloseTo(0.5);
      expect(events[0]!.data?.y).toBeCloseTo(-0.5);
    });

    it("clamps values exceeding maxRollDeg and maxPitchDeg", () => {
      const detector = createTiltDetector({ smoothingFactor: 0 });

      const extremeEvents = detector.push(makeSample({ gamma: 85, beta: -120 }));
      expect(extremeEvents[0]!.data?.x).toBe(1.0);
      expect(extremeEvents[0]!.data?.y).toBe(-1.0);

      const oppositeExtreme = detector.push(makeSample({ gamma: -90, beta: 150 }));
      expect(oppositeExtreme[0]!.data?.x).toBe(-1.0);
      expect(oppositeExtreme[0]!.data?.y).toBe(1.0);
    });

    it("supports custom angle thresholds", () => {
      const detector = createTiltDetector({
        maxRollDeg: 30,
        maxPitchDeg: 60,
        smoothingFactor: 0,
        deadZone: 0,
      });

      const events = detector.push(makeSample({ gamma: 15, beta: 30 }));
      expect(events[0]!.data?.x).toBeCloseTo(0.5); // 15 / 30
      expect(events[0]!.data?.y).toBeCloseTo(0.5); // 30 / 60
    });
  });

  describe("Center dead zone clamping", () => {
    it("clamps small movements within center dead zone to exactly (0, 0)", () => {
      const detector = createTiltDetector({
        smoothingFactor: 0,
        deadZone: 0.08,
      });

      // gamma = 2 deg -> rawX = 2 / 45 = 0.044 <= 0.08
      const rollJitter = detector.push(makeSample({ gamma: 2, beta: 0 }));
      expect(rollJitter[0]!.data).toEqual({ x: 0, y: 0 });

      // beta = 2 deg -> rawY = 2 / 45 = 0.044 <= 0.08
      const pitchJitter = detector.push(makeSample({ gamma: 0, beta: 2 }));
      expect(pitchJitter[0]!.data).toEqual({ x: 0, y: 0 });

      // diagonal jitter: hypot(1.5/45, 1.5/45) ~ 0.047 <= 0.08
      const diagJitter = detector.push(makeSample({ gamma: 1.5, beta: 1.5 }));
      expect(diagJitter[0]!.data).toEqual({ x: 0, y: 0 });
    });

    it("allows movements strictly outside the center dead zone", () => {
      const detector = createTiltDetector({
        smoothingFactor: 0,
        deadZone: 0.08,
      });

      // gamma = 4.5 deg -> rawX = 4.5 / 45 = 0.10 > 0.08
      const outside = detector.push(makeSample({ gamma: 4.5, beta: 0 }));
      expect(outside[0]!.data?.x).toBeCloseTo(0.1);
      expect(outside[0]!.data?.y).toBe(0);
    });

    it("supports configurable dead zone limits", () => {
      // deadZone = 0: no clamping
      const noDeadZone = createTiltDetector({
        deadZone: 0,
        smoothingFactor: 0,
      });
      const tinyMove = noDeadZone.push(makeSample({ gamma: 0.5, beta: 0 }));
      expect(tinyMove[0]!.data?.x).toBeCloseTo(0.5 / 45);

      // deadZone = 0.2: clamps larger movements
      const largeDeadZone = createTiltDetector({
        deadZone: 0.2,
        smoothingFactor: 0,
      });
      // gamma = 6 deg -> 6 / 45 = 0.133 <= 0.20
      const clampedMove = largeDeadZone.push(makeSample({ gamma: 6, beta: 0 }));
      expect(clampedMove[0]!.data).toEqual({ x: 0, y: 0 });
    });

    it("clamps real flat table ghost recording to (0, 0) across all samples", () => {
      const detector = createTiltDetector(); // uses default 0.08 dead zone

      for (const sample of tableFlatRecording.samples) {
        const events = detector.push(sample as Sample);
        expect(events).toHaveLength(1);
        expect(events[0]!.data?.x).toBe(0);
        expect(events[0]!.data?.y).toBe(0);
      }
    });
  });

  describe("EMA Smoothing", () => {
    it("initializes immediately on the first sample without lag", () => {
      const detector = createTiltDetector({
        smoothingFactor: 0.2,
        deadZone: 0,
      });

      const firstEvents = detector.push(makeSample({ gamma: 45, beta: 0 }));
      expect(firstEvents[0]!.data?.x).toBeCloseTo(1.0);
      expect(firstEvents[0]!.data?.y).toBe(0);
    });

    it("smooths consecutive steps according to smoothingFactor", () => {
      const detector = createTiltDetector({
        smoothingFactor: 0.2,
        deadZone: 0,
      });

      // Sample 1: start at 0
      detector.push(makeSample({ gamma: 0, beta: 0 }));

      // Sample 2: jump to 45 deg (raw = 1.0)
      // Expected smoothedX: 0.2 * 1.0 + 0.8 * 0.0 = 0.2
      const step2 = detector.push(makeSample({ gamma: 45, beta: 0 }));
      expect(step2[0]!.data?.x).toBeCloseTo(0.2);

      // Sample 3: stay at 45 deg (raw = 1.0)
      // Expected smoothedX: 0.2 * 1.0 + 0.8 * 0.2 = 0.36
      const step3 = detector.push(makeSample({ gamma: 45, beta: 0 }));
      expect(step3[0]!.data?.x).toBeCloseTo(0.36);

      // Sample 4: stay at 45 deg (raw = 1.0)
      // Expected smoothedX: 0.2 * 1.0 + 0.8 * 0.36 = 0.488
      const step4 = detector.push(makeSample({ gamma: 45, beta: 0 }));
      expect(step4[0]!.data?.x).toBeCloseTo(0.488);
    });

    it("disables smoothing when smoothingFactor is 0 or 1", () => {
      const zeroSmoothing = createTiltDetector({
        smoothingFactor: 0,
        deadZone: 0,
      });
      zeroSmoothing.push(makeSample({ gamma: 0, beta: 0 }));
      const immediate0 = zeroSmoothing.push(makeSample({ gamma: 45, beta: 0 }));
      expect(immediate0[0]!.data?.x).toBeCloseTo(1.0);

      const oneSmoothing = createTiltDetector({
        smoothingFactor: 1,
        deadZone: 0,
      });
      oneSmoothing.push(makeSample({ gamma: 0, beta: 0 }));
      const immediate1 = oneSmoothing.push(makeSample({ gamma: 45, beta: 0 }));
      expect(immediate1[0]!.data?.x).toBeCloseTo(1.0);
    });
  });

  describe("Reset behaviour", () => {
    it("resets internal smoothing state so next sample has no historical lag", () => {
      const detector = createTiltDetector({
        smoothingFactor: 0.2,
        deadZone: 0,
      });

      // Ramp up to 1.0
      detector.push(makeSample({ gamma: 45, beta: 0 }));
      detector.push(makeSample({ gamma: 45, beta: 0 }));

      // Reset
      detector.reset();

      // Next sample starts at -45 deg -> should immediately be -1.0
      const postReset = detector.push(makeSample({ gamma: -45, beta: 0 }));
      expect(postReset[0]!.data?.x).toBeCloseTo(-1.0);
    });
  });

  describe("Zero normalization and pure TypeScript safety", () => {
    it("normalizes -0 to positive 0 in data coordinates", () => {
      const detector = createTiltDetector({ smoothingFactor: 0 });
      const events = detector.push(makeSample({ gamma: -0, beta: -0 }));
      expect(Object.is(events[0]!.data?.x, -0)).toBe(false);
      expect(Object.is(events[0]!.data?.y, -0)).toBe(false);
      expect(events[0]!.data?.x).toBe(0);
      expect(events[0]!.data?.y).toBe(0);
    });
  });
});
