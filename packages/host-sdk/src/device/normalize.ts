// Owner: Yadnesh. The ONE place that turns raw browser motion events into a protocol Sample.
// Every axis difference between iOS and Android is fixed here and nowhere else.

import type { Sample } from "@haunt-kit/protocol";

export type Os = "ios" | "android" | "desktop" | "other";

export type RawMotion = {
  /** DeviceMotionEvent.accelerationIncludingGravity, m/s² */
  accelerationIncludingGravity?: { x: number | null; y: number | null; z: number | null } | null;
  /** DeviceMotionEvent.rotationRate, deg/s. alpha is around z, beta around x, gamma around y (W3C). */
  rotationRate?: { alpha: number | null; beta: number | null; gamma: number | null } | null;
};

export type RawOrientation = { alpha: number | null; beta: number | null; gamma: number | null };

/**
 * Sign of accelerationIncludingGravity per OS, relative to the W3C convention
 * (phone flat on a table, screen up → az ≈ +9.81).
 *
 * iOS Safari has historically reported the opposite sign. VERIFY with a real recording:
 * a phone lying still, screen up, must give az ≈ +9.81 after normalizing. If it gives -9.81,
 * flip the iOS value here (and only here) and update the test.
 */
export const ACCEL_SIGN: Record<Os, 1 | -1> = { ios: -1, android: 1, desktop: 1, other: 1 };

const n = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Normalizes raw motion + orientation into a Sample. Missing values become 0. */
export function normalizeSample(
  t: number,
  motion: RawMotion,
  orientation: RawOrientation | null,
  os: Os,
  rms?: number,
): Sample {
  const sign = ACCEL_SIGN[os];
  const a = motion.accelerationIncludingGravity;
  const r = motion.rotationRate;
  const sample: Sample = {
    t,
    ax: sign * n(a?.x),
    ay: sign * n(a?.y),
    az: sign * n(a?.z),
    // W3C: rotationRate.beta is around the x axis, gamma around y, alpha around z.
    gx: n(r?.beta),
    gy: n(r?.gamma),
    gz: n(r?.alpha),
    alpha: n(orientation?.alpha),
    beta: n(orientation?.beta),
    gamma: n(orientation?.gamma),
  };
  if (rms !== undefined) sample.rms = Math.min(1, Math.max(0, n(rms)));
  // -0 is noise from the sign flip; JSON can't keep it anyway.
  for (const k of ["ax", "ay", "az"] as const) if (Object.is(sample[k], -0)) sample[k] = 0;
  return sample;
}

/** Detects the OS from navigator fields. iPadOS reports a Mac user agent, so check touch points too. */
export function detectOs(nav: { userAgent: string; platform?: string; maxTouchPoints?: number }): Os {
  const ua = nav.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return "desktop";
  return "other";
}

/** Short browser name for the join message (1-40 chars). */
export function detectBrowser(userAgent: string): string {
  if (/CriOS|Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) return "Chrome";
  if (/FxiOS|Firefox\//.test(userAgent)) return "Firefox";
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Browser";
}
