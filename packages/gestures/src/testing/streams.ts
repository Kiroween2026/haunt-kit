// Test-only synthetic sensor streams and fast-check generators for the detectors.
import fc from "fast-check";
import type { GestureEvent, Sample } from "@haunt-kit/protocol";

export const G = 9.81;
const RAD = Math.PI / 180;

/** Deterministic noise in -1..1 (so a failing case can be replayed from its seed). */
export function noise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}

export type StreamOpts = { hz: number; seconds: number; seed?: number; t0?: number };

/** Sample times in ms for a stream. */
export function times({ hz, seconds, t0 = 0 }: StreamOpts): number[] {
  return Array.from({ length: Math.round(hz * seconds) }, (_, i) => t0 + Math.round((i * 1000) / hz));
}

export function sample(t: number, over: Partial<Sample> = {}): Sample {
  return { t, ax: 0, ay: 0, az: G, gx: 0, gy: 0, gz: 0, alpha: 0, beta: 0, gamma: 0, ...over };
}

/** Gravity in the phone's frame for a tilt (same axes as the real recordings). */
export function gravity(beta: number, gamma: number): [number, number, number] {
  const b = beta * RAD;
  const g = gamma * RAD;
  return [-G * Math.sin(g) * Math.cos(b), G * Math.sin(b), G * Math.cos(g) * Math.cos(b)];
}

/** A phone that is held still, with sensor noise: accel ±noiseA m/s², rotation ±noiseG deg/s. */
export function stillStream(
  o: StreamOpts & { noiseA?: number; noiseG?: number; beta?: number; gamma?: number },
): Sample[] {
  const rnd = noise(o.seed ?? 1);
  const [gx, gy, gz] = gravity(o.beta ?? 0, o.gamma ?? 0);
  return times(o).map((t) =>
    sample(t, {
      ax: gx + rnd() * (o.noiseA ?? 0.1),
      ay: gy + rnd() * (o.noiseA ?? 0.1),
      az: gz + rnd() * (o.noiseA ?? 0.1),
      gx: rnd() * (o.noiseG ?? 1),
      gy: rnd() * (o.noiseG ?? 1),
      gz: rnd() * (o.noiseG ?? 1),
      beta: o.beta ?? 0,
      gamma: o.gamma ?? 0,
    }),
  );
}

/** Back-and-forth shaking along `dir` (unit vector) at `freqHz`, with peak acceleration `amp`. */
export function shakingStream(
  o: StreamOpts & { freqHz: number; amp: number; dir: [number, number, number]; lead?: number },
): Sample[] {
  const rnd = noise(o.seed ?? 1);
  return times(o).map((t) => {
    const s = Math.sin(2 * Math.PI * o.freqHz * (t / 1000));
    return sample(t, {
      ax: o.dir[0] * o.amp * s + rnd() * 0.1,
      ay: o.dir[1] * o.amp * s + rnd() * 0.1,
      az: G + o.dir[2] * o.amp * s + rnd() * 0.1,
    });
  });
}

/** Constant rotation around the screen axis, in deg/s (positive = counter-clockwise). */
export function rotatingStream(o: StreamOpts & { rate: number }): Sample[] {
  const rnd = noise(o.seed ?? 1);
  return times(o).map((t) =>
    sample(t, { ax: rnd() * 0.1, ay: rnd() * 0.1, az: G + rnd() * 0.1, gz: o.rate }),
  );
}

/** One half-sine acceleration pulse along x (a flick), starting at `at` ms and lasting `lengthMs`. */
export function pulseStream(o: StreamOpts & { amp: number; at: number; lengthMs: number }): Sample[] {
  return times(o).map((t) => {
    const u = (t - o.at) / o.lengthMs;
    return sample(t, { ax: u >= 0 && u <= 1 ? o.amp * Math.sin(u * Math.PI) : 0 });
  });
}

/**
 * Repeating motion for Steady: hold still for `leadSec`, then `reps` movements. Each one lifts the
 * phone by `peakDeg` and brings it back in `repSec` (half-cosine), with `restSec` of rest between.
 * The phone turns around its x axis, so gravity moves from (0,0,g) toward (0,g,0).
 */
export function repStream(
  o: StreamOpts & {
    reps: number;
    peakDeg: number;
    repSec: number;
    restSec: number;
    leadSec?: number;
    noiseA?: number;
  },
): Sample[] {
  const rnd = noise(o.seed ?? 1);
  const lead = o.leadSec ?? 2.5;
  const period = o.repSec + o.restSec;
  const total = lead + o.reps * period + 1;
  return times({ ...o, seconds: total }).map((t) => {
    const sec = t / 1000 - lead;
    let angle = 0;
    if (sec >= 0 && sec < o.reps * period) {
      const u = (sec % period) / o.repSec;
      if (u < 1) angle = (o.peakDeg * (1 - Math.cos(2 * Math.PI * u))) / 2;
    }
    const n = o.noiseA ?? 0.1;
    return sample(t, {
      ax: rnd() * n,
      ay: G * Math.sin(angle * RAD) + rnd() * n,
      az: G * Math.cos(angle * RAD) + rnd() * n,
    });
  });
}

// ---------- rotation (for the shake rotation-invariance property) ----------

export type Mat = number[][];

export function rotationMatrix(rx: number, ry: number, rz: number): Mat {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx),
    Math.sin(rx),
    Math.cos(ry),
    Math.sin(ry),
    Math.cos(rz),
    Math.sin(rz),
  ] as const;
  return [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];
}

export function rotateAccel(samples: Sample[], m: Mat): Sample[] {
  return samples.map((s) => ({
    ...s,
    ax: m[0]![0]! * s.ax + m[0]![1]! * s.ay + m[0]![2]! * s.az,
    ay: m[1]![0]! * s.ax + m[1]![1]! * s.ay + m[1]![2]! * s.az,
    az: m[2]![0]! * s.ax + m[2]![1]! * s.ay + m[2]![2]! * s.az,
  }));
}

/** Runs a detector over a stream and returns every event. */
export function run(
  detector: { push(s: Sample): GestureEvent[] },
  samples: readonly Sample[],
): GestureEvent[] {
  return samples.flatMap((s) => detector.push(s));
}

// ---------- fast-check generators ----------

export const hzArb = fc.integer({ min: 30, max: 120 });
export const seedArb = fc.integer({ min: 1, max: 2 ** 31 });
export const unitVecArb: fc.Arbitrary<[number, number, number]> = fc
  .tuple(
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
  )
  .filter(([x, y, z]) => Math.hypot(x, y, z) > 0.2)
  .map(([x, y, z]) => {
    const m = Math.hypot(x, y, z);
    return [x / m, y / m, z / m];
  });
