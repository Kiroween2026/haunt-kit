import { readFileSync, readdirSync } from "node:fs";
import type { Sample } from "@haunt-kit/protocol";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sampleSchema } from "@haunt-kit/protocol";
import { G, MAX_TILT_DEG, SimModel, gravity, tiltFromPointer } from "./sim-model";

const mag = (s: { ax: number; ay: number; az: number }) => Math.hypot(s.ax, s.ay, s.az);

describe("simulator model", () => {
  it("pointer in the centre is flat, corners are ±45°", () => {
    expect(tiltFromPointer(0.5, 0.5)).toEqual({ beta: 0, gamma: 0 });
    expect(tiltFromPointer(0, 1)).toEqual({ beta: MAX_TILT_DEG, gamma: -MAX_TILT_DEG });
    expect(tiltFromPointer(NaN, 2)).toEqual({ beta: MAX_TILT_DEG, gamma: 0 });
  });

  it("flat gives az = +g, like a real phone screen-up", () => {
    expect(gravity(0, 0)).toEqual({ ax: -0, ay: 0, az: G });
  });

  it("property: gravity magnitude is always g and samples are valid, for any pointer", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (x, y) => {
          const m = new SimModel();
          m.setPointer(x, y);
          const s = m.sample(0);
          expect(mag(s)).toBeCloseTo(G, 6);
          expect(sampleSchema.safeParse(s).success).toBe(true);
        },
      ),
    );
  });

  it("property: an untouched simulator is perfectly still (zero variance)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (x, y) => {
          const m = new SimModel();
          m.setPointer(x, y);
          m.sample(0);
          const xs = Array.from({ length: 30 }, (_, i) => m.sample((i + 1) * 33));
          expect(new Set(xs.map((s) => mag(s).toFixed(9))).size).toBe(1);
          expect(xs.every((s) => s.gx === 0 && s.gy === 0 && s.gz === 0)).toBe(true);
        },
      ),
    );
  });

  it("shake is a strong burst that ends after 0.7 s", () => {
    const m = new SimModel();
    m.burst("shake", 0);
    const during = Array.from({ length: 20 }, (_, i) => mag(m.sample(i * 33)));
    expect(Math.max(...during)).toBeGreaterThan(20);
    expect(mag(m.sample(800))).toBeCloseTo(G, 6);
  });

  it("spin rotates more than 300° within 1 s", () => {
    const m = new SimModel();
    m.burst("spin", 0);
    let deg = 0;
    for (let t = 33; t <= 990; t += 33) deg += (m.sample(t).gz * 33) / 1000;
    expect(deg).toBeGreaterThan(300);
  });

  it("holding freezes the tilt even if the mouse moves", () => {
    const m = new SimModel();
    m.setPointer(0.5, 0.5);
    m.holding = true;
    m.setPointer(1, 1);
    expect(m.sample(0)).toMatchObject({ beta: 0, gamma: 0 });
  });

  it("moving the mouse gives a rotation rate", () => {
    const m = new SimModel();
    m.setPointer(0.5, 0.5);
    m.sample(0);
    m.setPointer(0.5, 0.75);
    expect(m.sample(100).gx).toBeCloseTo(225); // 22.5° in 0.1 s
  });
});

describe("simulator gravity matches real phones", () => {
  // Anish's real Android Chrome recordings (recordings/*.json, 60 Hz). For every sample, the
  // gravity this model predicts from beta/gamma must match the measured ax/ay/az.
  // The first version had the ax and ay signs backwards; this test found it.
  const dir = new URL("../../../recordings/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("there are real recordings to check against", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s: mean error under 1 m/s²", (file) => {
    const rec = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as { samples: Sample[] };
    let err = 0;
    for (const s of rec.samples) {
      const g = gravity(s.beta, s.gamma);
      err += Math.hypot(s.ax - g.ax, s.ay - g.ay, s.az - g.az);
    }
    expect(err / rec.samples.length).toBeLessThan(1);
  });
});
