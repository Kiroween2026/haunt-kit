import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sampleSchema } from "@haunt-kit/protocol";
import { ACCEL_SIGN, detectBrowser, detectOs, normalizeSample } from "./normalize";
import { rmsOf } from "./rms";
import { FrameBatcher } from "./batcher";
import { backoffDelay } from "../backoff";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
};

describe("normalizeSample", () => {
  const flat = {
    accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
    rotationRate: { alpha: 3, beta: 1, gamma: 2 },
  };

  it("Android flat screen-up gives az +9.81", () => {
    expect(normalizeSample(0, flat, null, "android").az).toBeCloseTo(9.81);
  });

  it("iOS raw values are sign-flipped, so iOS -9.81 also becomes +9.81", () => {
    const ios = { accelerationIncludingGravity: { x: 0, y: 0, z: -9.81 } };
    expect(ACCEL_SIGN.ios).toBe(-1);
    expect(normalizeSample(0, ios, null, "ios").az).toBeCloseTo(9.81);
  });

  it("maps rotationRate to axes the W3C way: beta→gx, gamma→gy, alpha→gz", () => {
    const s = normalizeSample(0, flat, null, "android");
    expect([s.gx, s.gy, s.gz]).toEqual([1, 2, 3]);
  });

  it("missing values become 0, rms is clamped", () => {
    const s = normalizeSample(5, {}, { alpha: null, beta: 10, gamma: null }, "ios", 3);
    expect(s).toEqual({
      t: 5,
      ax: 0,
      ay: 0,
      az: 0,
      gx: 0,
      gy: 0,
      gz: 0,
      alpha: 0,
      beta: 10,
      gamma: 0,
      rms: 1,
    });
  });

  it("always produces a valid protocol Sample, for any raw input", () => {
    const v = fc.option(fc.double(), { nil: null });
    fc.assert(
      fc.property(
        fc.record({ x: v, y: v, z: v }),
        fc.record({ alpha: v, beta: v, gamma: v }),
        fc.record({ alpha: v, beta: v, gamma: v }),
        fc.constantFrom("ios" as const, "android" as const, "desktop" as const, "other" as const),
        fc.option(fc.double(), { nil: undefined }),
        (a, r, o, os, rms) => {
          const s = normalizeSample(1, { accelerationIncludingGravity: a, rotationRate: r }, o, os, rms);
          expect(sampleSchema.safeParse(s).success).toBe(true);
        },
      ),
    );
  });
});

describe("detectOs / detectBrowser", () => {
  it("detects iPhone, iPadOS (Mac UA + touch), Android and desktop", () => {
    expect(detectOs({ userAgent: UA.iphone })).toBe("ios");
    expect(detectOs({ userAgent: UA.ipad, maxTouchPoints: 5 })).toBe("ios");
    expect(detectOs({ userAgent: UA.android })).toBe("android");
    expect(detectOs({ userAgent: UA.mac, maxTouchPoints: 0 })).toBe("desktop");
  });
  it("names the browser", () => {
    expect(detectBrowser(UA.iphone)).toBe("Safari");
    expect(detectBrowser(UA.android)).toBe("Chrome");
  });
});

describe("rmsOf", () => {
  it("is 0 for silence and 1 for a full-scale square wave", () => {
    expect(rmsOf(new Float32Array(128))).toBe(0);
    expect(rmsOf(Array.from({ length: 128 }, (_, i) => (i % 2 ? 1 : -1)))).toBe(1);
  });
  it("is always within 0..1", () => {
    fc.assert(
      fc.property(fc.array(fc.double()), (xs) => {
        const r = rmsOf(xs);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("FrameBatcher", () => {
  const s = (t: number) => ({ t, ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0, alpha: 0, beta: 0, gamma: 0 });

  it("at 30 Hz sends a batch about every 100 ms", () => {
    const b = new FrameBatcher();
    const batches: number[] = [];
    for (let i = 0; i < 30; i++) {
      const out = b.push(s(i), (i * 1000) / 30);
      if (out) batches.push(out.length);
    }
    expect(batches.length).toBeGreaterThanOrEqual(9);
    expect(Math.max(...batches)).toBeLessThanOrEqual(4);
  });

  it("never loses or reorders a sample and never exceeds 32 per batch", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 200 }), { maxLength: 300 }), (gaps) => {
        const b = new FrameBatcher();
        const out: number[] = [];
        let now = 0;
        gaps.forEach((gap, i) => {
          now += gap;
          const batch = b.push(s(i), now);
          if (batch) {
            expect(batch.length).toBeLessThanOrEqual(32);
            out.push(...batch.map((x) => x.t));
          }
        });
        out.push(...(b.flush(now) ?? []).map((x) => x.t));
        expect(out).toEqual(gaps.map((_, i) => i));
      }),
    );
  });
});

describe("backoffDelay", () => {
  it("grows, then caps at 5 s ± 20 %", () => {
    expect(backoffDelay(0, () => 0.5)).toBe(500);
    expect(backoffDelay(3, () => 0.5)).toBe(4000);
    expect(backoffDelay(20, () => 1)).toBe(6000);
    expect(backoffDelay(20, () => 0)).toBe(4000);
  });
});
