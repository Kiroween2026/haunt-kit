// Owner: Yadnesh. Summary numbers for a stretch of samples, so Kiro can reason about thresholds.

import type { Sample } from "@haunt-kit/protocol";

export const AXES = ["ax", "ay", "az", "gx", "gy", "gz", "alpha", "beta", "gamma", "rms"] as const;
export type Axis = (typeof AXES)[number];
export type AxisStats = { min: number; max: number; mean: number; variance: number };

export type Snapshot = {
  count: number;
  durationMs: number;
  sampleRateHz: number | null;
  axes: Partial<Record<Axis | "accelMagnitude", AxisStats>>;
};

/** Mean and population variance with Welford's method (stable for long streams). */
export function axisStats(values: readonly number[]): AxisStats | null {
  if (values.length === 0) return null;
  let mean = 0;
  let m2 = 0;
  let min = Infinity;
  let max = -Infinity;
  values.forEach((v, i) => {
    const d = v - mean;
    mean += d / (i + 1);
    m2 += d * (v - mean);
    if (v < min) min = v;
    if (v > max) max = v;
  });
  return { min, max, mean, variance: Math.max(0, m2 / values.length) };
}

export function snapshot(samples: readonly Sample[]): Snapshot {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const durationMs = first && last ? last.t - first.t : 0;
  const axes: Snapshot["axes"] = {};
  for (const axis of AXES) {
    const values = samples.flatMap((s) => (typeof s[axis] === "number" ? [s[axis] as number] : []));
    const st = axisStats(values);
    if (st) axes[axis] = st;
  }
  const mag = axisStats(samples.map((s) => Math.hypot(s.ax, s.ay, s.az)));
  if (mag) axes.accelMagnitude = mag;
  return {
    count: samples.length,
    durationMs,
    sampleRateHz: durationMs > 0 ? Math.round(((samples.length - 1) * 1000) / durationMs) : null,
    axes,
  };
}

/** Keeps at most `max` samples, evenly spaced, always including the last one. */
export function downsample<T>(xs: readonly T[], max: number): T[] {
  if (xs.length <= max) return [...xs];
  const step = xs.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(xs[Math.floor(i * step)]!);
  out.push(xs[xs.length - 1]!);
  return out;
}
