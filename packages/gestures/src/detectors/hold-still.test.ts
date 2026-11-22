import type { GestureEvent } from "@haunt-kit/protocol";
import { describe, expect, it } from "vitest";
import type { Sample } from "@haunt-kit/protocol";
import { DEFAULT_HOLD_STILL_CONFIG, createHoldStillDetector, holdStillDetector } from "./hold-still";
import leftRightRecording from "../../../../recordings/ghost-recording-android-left-right-2026-11-17T17-47-51-393Z.json";
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

describe("Hold-Still Detector (Task 2.3)", () => {
  describe("Detector contract and default configuration", () => {
    it("conforms to the Detector contract metadata", () => {
      expect(holdStillDetector.name).toBe("hold-still");
      expect(holdStillDetector.defaults).toEqual({
        varianceThreshold: 0.4,
        holdDurationMs: 1200,
      });
      expect(DEFAULT_HOLD_STILL_CONFIG).toEqual(holdStillDetector.defaults);
    });

    it("creates detector instances with create() and createHoldStillDetector()", () => {
      const instance1 = holdStillDetector.create();
      expect(typeof instance1.push).toBe("function");
      expect(typeof instance1.reset).toBe("function");

      const instanceWithDefaults = holdStillDetector.create(holdStillDetector.defaults);
      expect(typeof instanceWithDefaults.push).toBe("function");

      const instance2 = createHoldStillDetector();
      expect(typeof instance2.push).toBe("function");
      expect(typeof instance2.reset).toBe("function");
    });
  });

  describe("Stillness detection", () => {
    it("emits hold-still when phone remains still for holdDurationMs (1200 ms)", () => {
      const detector = createHoldStillDetector();

      // Feed perfectly still samples every 50 ms from t = 0 to 1150 ms
      for (let t = 0; t < 1200; t += 50) {
        const events = detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
        expect(events).toHaveLength(0); // Before 1200 ms, no event
      }

      // At t = 1200 ms (exactly 1200 ms elapsed), hold-still triggers
      const events = detector.push(makeSample({ t: 1200, ax: 0, ay: 0, az: 9.81 }));
      expect(events).toHaveLength(1);
      expect(events[0]!.name).toBe("hold-still");
      expect(events[0]!.t).toBe(1200);
      expect(events[0]!.data?.state).toBe(1);
      expect(events[0]!.data?.variance).toBeCloseTo(0);
    });

    it("does not flood events while the phone continues to hold still", () => {
      const detector = createHoldStillDetector();

      for (let t = 0; t <= 1200; t += 50) {
        detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
      }

      // Next 500 ms of continued stillness: no duplicate events
      for (let t = 1250; t <= 1700; t += 50) {
        const events = detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
        expect(events).toHaveLength(0);
      }
    });

    it("operates identically across different phone orientations", () => {
      // 1. Flat on table (az = 9.81)
      const flat = createHoldStillDetector();
      let flatTriggered = false;
      for (let t = 0; t <= 1200; t += 50) {
        const ev = flat.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
        if (ev.length > 0) flatTriggered = true;
      }
      expect(flatTriggered).toBe(true);

      // 2. Upright portrait (ay = 9.81, az = 0)
      const upright = createHoldStillDetector();
      let uprightTriggered = false;
      for (let t = 0; t <= 1200; t += 50) {
        const ev = upright.push(makeSample({ t, ax: 0, ay: 9.81, az: 0 }));
        if (ev.length > 0) uprightTriggered = true;
      }
      expect(uprightTriggered).toBe(true);

      // 3. 45-degree angle (ay = 6.94, az = 6.94)
      const tilted = createHoldStillDetector();
      let tiltedTriggered = false;
      for (let t = 0; t <= 1200; t += 50) {
        const ev = tilted.push(makeSample({ t, ax: 0, ay: 6.937, az: 6.937 }));
        if (ev.length > 0) tiltedTriggered = true;
      }
      expect(tiltedTriggered).toBe(true);
    });
  });

  describe("Breaking stillness and recovery", () => {
    it("emits hold-still-broken when motion occurs while holding still", () => {
      const detector = createHoldStillDetector();

      // Establish stillness
      for (let t = 0; t <= 1200; t += 50) {
        detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
      }

      // Sudden movement sample at t = 1250 ms
      const breakEvents = detector.push(makeSample({ t: 1250, ax: 15.0, ay: 10.0, az: 0 }));
      expect(breakEvents).toHaveLength(1);
      expect(breakEvents[0]!.name).toBe("hold-still-broken");
      expect(breakEvents[0]!.t).toBe(1250);
      expect(breakEvents[0]!.data?.state).toBe(0);
      expect(breakEvents[0]!.data?.variance).toBeGreaterThan(0.4);
    });

    it("does not emit multiple hold-still-broken events on continuous movement", () => {
      const detector = createHoldStillDetector();

      // Establish stillness
      for (let t = 0; t <= 1200; t += 50) {
        detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
      }

      // First movement breaks stillness
      const breakEvent = detector.push(makeSample({ t: 1250, ax: 15.0, ay: 10.0, az: 0 }));
      expect(breakEvent).toHaveLength(1);

      // Continued movement: no repeated broken events
      for (let t = 1300; t <= 1600; t += 50) {
        const events = detector.push(makeSample({ t, ax: 12.0, ay: 8.0, az: 2.0 }));
        expect(events).toHaveLength(0);
      }
    });

    it("re-emits hold-still when phone becomes still again for 1200 ms", () => {
      const detector = createHoldStillDetector();

      // Stillness 1
      for (let t = 0; t <= 1200; t += 50) {
        detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
      }

      // Break at t = 1250 ms
      detector.push(makeSample({ t: 1250, ax: 15, ay: 0, az: 0 }));

      // Rest starts again at t = 1300 ms
      // The motion sample at t = 1250 leaves the 1200 ms window when t > 1250 + 1200 = 2450 ms
      let recovered = false;
      for (let t = 1300; t <= 2500; t += 50) {
        const ev = detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
        if (ev.length > 0 && ev[0]!.name === "hold-still") {
          recovered = true;
          expect(ev[0]!.data?.state).toBe(1);
          expect(t).toBeGreaterThanOrEqual(2450);
        }
      }
      expect(recovered).toBe(true);
    });
  });

  describe("Noisy sensor input handling", () => {
    it("tolerates realistic resting sensor noise (|noise| < 0.1 m/s²)", () => {
      const detector = createHoldStillDetector();

      // Pseudo-random realistic noise with zero mean
      for (let t = 0; t <= 1200; t += 50) {
        const noiseX = Math.sin(t * 0.1) * 0.08;
        const noiseY = Math.cos(t * 0.1) * 0.08;
        const noiseZ = Math.sin(t * 0.2) * 0.08;

        const ev = detector.push(makeSample({ t, ax: noiseX, ay: noiseY, az: 9.81 + noiseZ }));
        if (t === 1200) {
          expect(ev).toHaveLength(1);
          expect(ev[0]!.name).toBe("hold-still");
        }
      }
    });

    it("rejects motion with variance exceeding 0.4 m/s²", () => {
      const detector = createHoldStillDetector();

      // Movement oscillation exceeding 0.4 variance
      for (let t = 0; t <= 2000; t += 50) {
        const ax = Math.sin(t * 0.05) * 1.5; // variance will be > 0.4
        const ev = detector.push(makeSample({ t, ax, ay: 0, az: 9.81 }));
        expect(ev).toHaveLength(0);
      }
    });
  });

  describe("Validation against real Ghost Recordings", () => {
    it("detects hold-still on real table-flat recording and never breaks", () => {
      const detector = createHoldStillDetector();
      let triggeredHoldStill = false;
      let brokenCount = 0;

      for (const sample of tableFlatRecording.samples) {
        const events = detector.push(sample as Sample);
        for (const e of events) {
          if (e.name === "hold-still") {
            triggeredHoldStill = true;
          }
          if (e.name === "hold-still-broken") {
            brokenCount++;
          }
        }
      }

      expect(triggeredHoldStill).toBe(true);
      expect(brokenCount).toBe(0);
    });

    it("detects hold-still followed by hold-still-broken on real left-right recording as motion pauses and resumes", () => {
      const detector = createHoldStillDetector();
      const detectedEvents: GestureEvent[] = [];

      for (const sample of leftRightRecording.samples) {
        const events = detector.push(sample as Sample);
        detectedEvents.push(...events);
      }

      expect(detectedEvents).toHaveLength(2);
      expect(detectedEvents[0]!.name).toBe("hold-still");
      expect(detectedEvents[0]!.data?.state).toBe(1);
      expect(detectedEvents[1]!.name).toBe("hold-still-broken");
      expect(detectedEvents[1]!.data?.state).toBe(0);
    });
  });

  describe("Reset behavior and memory bounds", () => {
    it("clears historical window and stillness state upon reset()", () => {
      const detector = createHoldStillDetector();

      // Accumulate 1100 ms of stillness
      for (let t = 0; t <= 1100; t += 50) {
        detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
      }

      // Reset
      detector.reset();

      // Next sample at 1200 ms: since it was reset, timeSpan is 0, so should not trigger
      const events = detector.push(makeSample({ t: 1200, ax: 0, ay: 0, az: 9.81 }));
      expect(events).toHaveLength(0);
    });

    it("maintains bounded memory over 5,000 continuous samples", () => {
      const detector = createHoldStillDetector();

      for (let i = 0; i < 5000; i++) {
        detector.push(makeSample({ t: i * 16, ax: 0, ay: 0, az: 9.81 }));
      }

      // Verify detector still functions properly
      const breakEvent = detector.push(makeSample({ t: 80050, ax: 20, ay: 0, az: 0 }));
      expect(breakEvent).toHaveLength(1);
      expect(breakEvent[0]!.name).toBe("hold-still-broken");
    });
  });

  describe("Boundary and invalid configuration cases", () => {
    it("safely ignores non-finite samples (NaN, Infinity)", () => {
      const detector = createHoldStillDetector();

      expect(detector.push(makeSample({ ax: NaN }))).toHaveLength(0);
      expect(detector.push(makeSample({ az: Infinity }))).toHaveLength(0);
      expect(detector.push(makeSample({ t: NaN }))).toHaveLength(0);
    });

    it("falls back safely on non-positive configurations", () => {
      const detector = createHoldStillDetector({
        varianceThreshold: -1,
        holdDurationMs: -500,
      });

      // Default varianceThreshold (0.4) and holdDurationMs (1200) applied
      for (let t = 0; t <= 1200; t += 50) {
        const ev = detector.push(makeSample({ t, ax: 0, ay: 0, az: 9.81 }));
        if (t === 1200) {
          expect(ev).toHaveLength(1);
          expect(ev[0]!.name).toBe("hold-still");
        }
      }
    });
  });
});
