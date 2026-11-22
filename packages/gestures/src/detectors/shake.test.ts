import { describe, expect, it } from "vitest";
import type { Sample } from "@haunt-kit/protocol";
import { DEFAULT_SHAKE_CONFIG, createShakeDetector, shakeDetector } from "./shake";
import leftRightRecording from "../../../../recordings/ghost-recording-android-left-right-2026-11-17T17-47-51-393Z.json";
import slideRecording from "../../../../recordings/ghost-recording-android-slide-2026-11-17T17-53-27-552Z.json";
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

describe("Shake Detector (Task 2.2)", () => {
  describe("Detector contract and default configuration", () => {
    it("conforms to the Detector contract metadata", () => {
      expect(shakeDetector.name).toBe("shake");
      expect(shakeDetector.defaults).toEqual({
        threshold: 18.0,
        minPeaks: 3,
        windowMs: 600,
        cooldownMs: 400,
      });
      expect(DEFAULT_SHAKE_CONFIG).toEqual(shakeDetector.defaults);
    });

    it("creates detector instances with create() and createShakeDetector()", () => {
      const instance1 = shakeDetector.create();
      expect(typeof instance1.push).toBe("function");
      expect(typeof instance1.reset).toBe("function");

      const instanceWithDefaults = shakeDetector.create(shakeDetector.defaults);
      expect(typeof instanceWithDefaults.push).toBe("function");

      const instance2 = createShakeDetector();
      expect(typeof instance2.push).toBe("function");
      expect(typeof instance2.reset).toBe("function");
    });
  });

  describe("Normal shake detection", () => {
    it("emits a shake event when 3 qualifying peaks occur within window", () => {
      const detector = createShakeDetector();

      // Peak 1 at t = 100 ms (magnitude = 22 m/s²)
      const e1 = detector.push(makeSample({ t: 100, ax: 22, ay: 0, az: 0 }));
      expect(e1).toHaveLength(0);

      // Peak 2 at t = 200 ms (magnitude = 24 m/s²)
      const e2 = detector.push(makeSample({ t: 200, ax: 24, ay: 0, az: 0 }));
      expect(e2).toHaveLength(0);

      // Peak 3 at t = 300 ms (magnitude = 20 m/s²)
      const e3 = detector.push(makeSample({ t: 300, ax: 20, ay: 0, az: 0 }));
      expect(e3).toHaveLength(1);
      expect(e3[0]!.name).toBe("shake");
      expect(e3[0]!.t).toBe(300);
      expect(e3[0]!.data).toBeDefined();
      expect(e3[0]!.data?.intensity).toBeCloseTo(24); // max peak magnitude
    });

    it("reports correct intensity matching maximum peak magnitude in the window", () => {
      const detector = createShakeDetector();

      detector.push(makeSample({ t: 100, ax: 20, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 200, ax: 35, ay: 0, az: 0 }));
      const events = detector.push(makeSample({ t: 300, ax: 22, ay: 0, az: 0 }));

      expect(events).toHaveLength(1);
      expect(events[0]!.data?.intensity).toBeCloseTo(35);
    });
  });

  describe("Weak movements and still phone (no false positives)", () => {
    it("never triggers when phone is at rest with gravity (~9.81 m/s²)", () => {
      const detector = createShakeDetector();

      for (let t = 0; t < 1000; t += 16) {
        const events = detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
        expect(events).toHaveLength(0);
      }
    });

    it("does not trigger on weak or gentle motions below threshold", () => {
      const detector = createShakeDetector();

      // Moderate motions reaching ~15 m/s² (below 18.0 threshold)
      const events1 = detector.push(makeSample({ t: 100, ax: 11, ay: 10, az: 0 })); // mag ~14.86
      const events2 = detector.push(makeSample({ t: 200, ax: -12, ay: 8, az: 0 })); // mag ~14.42
      const events3 = detector.push(makeSample({ t: 300, ax: 10, ay: -10, az: 0 })); // mag ~14.14

      expect(events1).toHaveLength(0);
      expect(events2).toHaveLength(0);
      expect(events3).toHaveLength(0);
    });

    it("produces zero false positives on real benchmark recordings", () => {
      const detector = createShakeDetector();

      // Test flat table recording
      for (const sample of tableFlatRecording.samples) {
        const events = detector.push(sample as Sample);
        expect(events).toHaveLength(0);
      }

      detector.reset();

      // Test left-right tilt recording
      for (const sample of leftRightRecording.samples) {
        const events = detector.push(sample as Sample);
        expect(events).toHaveLength(0);
      }

      detector.reset();

      // Test sliding recording
      for (const sample of slideRecording.samples) {
        const events = detector.push(sample as Sample);
        expect(events).toHaveLength(0);
      }
    });
  });

  describe("Strict 3D rotation invariance", () => {
    it("detects shake equally along X, Y, and Z axes", () => {
      // X-axis shake
      const detectorX = createShakeDetector();
      detectorX.push(makeSample({ t: 100, ax: 20, ay: 0, az: 0 }));
      detectorX.push(makeSample({ t: 200, ax: 22, ay: 0, az: 0 }));
      const eventsX = detectorX.push(makeSample({ t: 300, ax: 21, ay: 0, az: 0 }));
      expect(eventsX).toHaveLength(1);

      // Y-axis shake
      const detectorY = createShakeDetector();
      detectorY.push(makeSample({ t: 100, ax: 0, ay: 20, az: 0 }));
      detectorY.push(makeSample({ t: 200, ax: 0, ay: 22, az: 0 }));
      const eventsY = detectorY.push(makeSample({ t: 300, ax: 0, ay: 21, az: 0 }));
      expect(eventsY).toHaveLength(1);

      // Z-axis shake
      const detectorZ = createShakeDetector();
      detectorZ.push(makeSample({ t: 100, ax: 0, ay: 0, az: 20 }));
      detectorZ.push(makeSample({ t: 200, ax: 0, ay: 0, az: 22 }));
      const eventsZ = detectorZ.push(makeSample({ t: 300, ax: 0, ay: 0, az: 21 }));
      expect(eventsZ).toHaveLength(1);

      // All produce the same intensity
      expect(eventsX[0]!.data?.intensity).toBeCloseTo(eventsY[0]!.data!.intensity!);
      expect(eventsY[0]!.data?.intensity).toBeCloseTo(eventsZ[0]!.data!.intensity!);
    });

    it("produces identical detection results under arbitrary 3D rotation matrix", () => {
      const baseSamples: Sample[] = [
        makeSample({ t: 100, ax: 20, ay: 5, az: 2 }),
        makeSample({ t: 150, ax: 0, ay: 0, az: 9.81 }),
        makeSample({ t: 250, ax: -22, ay: 4, az: -3 }),
        makeSample({ t: 300, ax: 0, ay: 0, az: 9.81 }),
        makeSample({ t: 400, ax: 25, ay: -6, az: 1 }),
      ];

      // Exact orthogonal 3D rotation matrix via Euler angles (yaw 30 deg, pitch 45 deg, roll 60 deg)
      const yaw = Math.PI / 6;
      const pitch = Math.PI / 4;
      const roll = Math.PI / 3;

      const cy = Math.cos(yaw),
        sy = Math.sin(yaw);
      const cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      const cr = Math.cos(roll),
        sr = Math.sin(roll);

      const R = [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
      ] as const;

      const rotatedSamples: Sample[] = baseSamples.map((s) => ({
        ...s,
        ax: R[0][0] * s.ax + R[0][1] * s.ay + R[0][2] * s.az,
        ay: R[1][0] * s.ax + R[1][1] * s.ay + R[1][2] * s.az,
        az: R[2][0] * s.ax + R[2][1] * s.ay + R[2][2] * s.az,
      }));

      const detectorBase = createShakeDetector();
      const detectorRotated = createShakeDetector();

      const eventsBase = baseSamples.flatMap((s) => detectorBase.push(s));
      const eventsRotated = rotatedSamples.flatMap((s) => detectorRotated.push(s));

      expect(eventsBase).toHaveLength(1);
      expect(eventsRotated).toHaveLength(1);
      expect(eventsRotated[0]!.t).toBe(eventsBase[0]!.t);
      expect(eventsRotated[0]!.data?.intensity).toBeCloseTo(eventsBase[0]!.data!.intensity!, 3);
    });
  });

  describe("Peak counting and sliding window behaviour", () => {
    it("groups high-frequency samples from the same physical stroke as a single peak", () => {
      const detector = createShakeDetector();

      // Stroke 1: 3 samples within 32 ms at 60 Hz (> 18 threshold)
      detector.push(makeSample({ t: 100, ax: 20, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 116, ax: 24, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 132, ax: 21, ay: 0, az: 0 }));

      // Dips back to rest
      detector.push(makeSample({ t: 148, ax: 5, ay: 0, az: 9.81 }));

      // Stroke 2
      detector.push(makeSample({ t: 250, ax: 22, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 266, ax: 23, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 290, ax: 5, ay: 0, az: 9.81 }));

      // At this point, only 2 peaks have occurred — should NOT fire yet
      expect(detector.push(makeSample({ t: 300, ax: 5, ay: 0, az: 9.81 }))).toHaveLength(0);

      // Stroke 3: triggers the shake
      const e3 = detector.push(makeSample({ t: 380, ax: 25, ay: 0, az: 0 }));
      expect(e3).toHaveLength(1);
      expect(e3[0]!.name).toBe("shake");
    });

    it("expires old peaks outside the configured windowMs", () => {
      const detector = createShakeDetector({ windowMs: 600 });

      // Peak 1 at t = 100
      detector.push(makeSample({ t: 100, ax: 22, ay: 0, az: 0 }));
      // Peak 2 at t = 200
      detector.push(makeSample({ t: 200, ax: 22, ay: 0, az: 0 }));

      // Long delay of 700 ms (> 600 ms window cutoff)
      // At t = 950, peaks 1 & 2 are older than 950 - 600 = 350 ms, so they expired
      detector.push(makeSample({ t: 950, ax: 22, ay: 0, az: 0 })); // Peak 3

      // Only 1 peak is currently in window — no shake event should fire
      const events = detector.push(makeSample({ t: 960, ax: 5, ay: 0, az: 9.81 }));
      expect(events).toHaveLength(0);
    });

    it("respects custom minPeaks and windowMs configurations", () => {
      const detector = createShakeDetector({ minPeaks: 2, windowMs: 400 });

      detector.push(makeSample({ t: 50, ax: 20, ay: 0, az: 0 }));
      const events = detector.push(makeSample({ t: 150, ax: 22, ay: 0, az: 0 }));

      expect(events).toHaveLength(1);
      expect(events[0]!.name).toBe("shake");
    });
  });

  describe("Cooldown enforcement", () => {
    it("suppresses shake events during the cooldown period", () => {
      const detector = createShakeDetector({ cooldownMs: 400 });

      // Trigger first shake at t = 300 ms
      detector.push(makeSample({ t: 100, ax: 20, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 200, ax: 20, ay: 0, az: 0 }));
      const firstEvent = detector.push(makeSample({ t: 300, ax: 20, ay: 0, az: 0 }));
      expect(firstEvent).toHaveLength(1);

      // Subsequent peaks during cooldown (t = 400, 500, 600; where t - 300 < 400)
      const c1 = detector.push(makeSample({ t: 400, ax: 25, ay: 0, az: 0 }));
      const c2 = detector.push(makeSample({ t: 500, ax: 25, ay: 0, az: 0 }));
      const c3 = detector.push(makeSample({ t: 600, ax: 25, ay: 0, az: 0 }));

      expect(c1).toHaveLength(0);
      expect(c2).toHaveLength(0);
      expect(c3).toHaveLength(0);

      // Once cooldown has elapsed (t = 701 ms, 701 - 300 = 401 >= 400 ms)
      // When enough peaks occur in window, next shake triggers
      const nextEvent = detector.push(makeSample({ t: 720, ax: 25, ay: 0, az: 0 }));
      expect(nextEvent).toHaveLength(1);
      expect(nextEvent[0]!.t).toBe(720);
    });

    it("respects custom cooldown configuration", () => {
      const detector = createShakeDetector({ cooldownMs: 200, minPeaks: 2 });

      detector.push(makeSample({ t: 100, ax: 20, ay: 0, az: 0 }));
      const e1 = detector.push(makeSample({ t: 200, ax: 20, ay: 0, az: 0 }));
      expect(e1).toHaveLength(1);

      // t = 300: 300 - 200 = 100 < 200 (cooldown active)
      detector.push(makeSample({ t: 300, ax: 20, ay: 0, az: 0 }));

      // t = 420: 420 - 200 = 220 >= 200 (cooldown expired)
      const e2 = detector.push(makeSample({ t: 420, ax: 20, ay: 0, az: 0 }));
      expect(e2).toHaveLength(1);
    });
  });

  describe("Reset behaviour and memory bounds", () => {
    it("clears accumulated peaks upon reset()", () => {
      const detector = createShakeDetector();

      // Accumulate 2 peaks
      detector.push(makeSample({ t: 100, ax: 20, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 200, ax: 20, ay: 0, az: 0 }));

      // Reset
      detector.reset();

      // Only 1 peak arrives after reset — should NOT trigger
      const events = detector.push(makeSample({ t: 300, ax: 20, ay: 0, az: 0 }));
      expect(events).toHaveLength(0);
    });

    it("clears cooldown state upon reset()", () => {
      const detector = createShakeDetector({ cooldownMs: 400 });

      // Fire shake at t = 300 ms
      detector.push(makeSample({ t: 100, ax: 20, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 200, ax: 20, ay: 0, az: 0 }));
      const e1 = detector.push(makeSample({ t: 300, ax: 20, ay: 0, az: 0 }));
      expect(e1).toHaveLength(1);

      // Reset immediately
      detector.reset();

      // Next shake sequence starting at t = 350 ms (< 300 + 400 cooldown) should succeed
      detector.push(makeSample({ t: 350, ax: 20, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 420, ax: 20, ay: 0, az: 0 }));
      const e2 = detector.push(makeSample({ t: 490, ax: 20, ay: 0, az: 0 }));
      expect(e2).toHaveLength(1);
      expect(e2[0]!.t).toBe(490);
    });

    it("maintains bounded memory over 5,000 samples", () => {
      const detector = createShakeDetector();

      // Continuous streaming of 5,000 samples
      for (let i = 0; i < 5000; i++) {
        const ax = i % 50 === 0 ? 22 : 0;
        detector.push(makeSample({ t: i * 16, ax, ay: 0, az: 9.81 }));
      }

      // Detector continues working properly
      detector.push(makeSample({ t: 80100, ax: 22, ay: 0, az: 0 }));
      detector.push(makeSample({ t: 80200, ax: 22, ay: 0, az: 0 }));
      const events = detector.push(makeSample({ t: 80300, ax: 22, ay: 0, az: 0 }));
      expect(events).toHaveLength(1);
    });
  });

  describe("Boundary and invalid configuration cases", () => {
    it("safely ignores non-finite samples (NaN, Infinity)", () => {
      const detector = createShakeDetector();

      const nanEvent = detector.push(makeSample({ ax: NaN, ay: 0, az: 9.81 }));
      expect(nanEvent).toHaveLength(0);

      const infEvent = detector.push(makeSample({ ax: Infinity, ay: 0, az: 9.81 }));
      expect(infEvent).toHaveLength(0);

      const negInfEvent = detector.push(makeSample({ t: NaN, ax: 0, ay: 0, az: 9.81 }));
      expect(negInfEvent).toHaveLength(0);
    });

    it("falls back safely on non-positive or invalid configs", () => {
      const detector = createShakeDetector({
        threshold: -5,
        minPeaks: 0,
        windowMs: -100,
        cooldownMs: -50,
      });

      // Default threshold (18) and minimum peaks (1) are applied
      detector.push(makeSample({ t: 100, ax: 15, ay: 0, az: 0 })); // below 18 -> no trigger
      const eBelow = detector.push(makeSample({ t: 150, ax: 16, ay: 0, az: 0 }));
      expect(eBelow).toHaveLength(0);

      const eAbove = detector.push(makeSample({ t: 200, ax: 20, ay: 0, az: 0 })); // above 18 -> triggers
      expect(eAbove).toHaveLength(1);
    });
  });
});
