// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/** Configuration options for the Spin Detector. */
export interface SpinConfig {
  /** Rotation around the screen axis needed to count as a spin, in degrees. Default: 300 */
  targetDegrees: number;
  /** The rotation must happen within this window, in ms. Default: 1000 */
  windowMs: number;
  /** Quiet time after a spin, in ms. Default: 800 */
  cooldownMs: number;
  /** Gaps between samples longer than this are treated as this long, in ms. Default: 100 */
  maxGapMs: number;
}

export const DEFAULT_SPIN_CONFIG: SpinConfig = {
  targetDegrees: 300,
  windowMs: 1000,
  cooldownMs: 800,
  maxGapMs: 100,
};

/**
 * Spin: rotation around the axis that points out of the screen, from `gz` (deg/s).
 * Integrates gz over time, so the result doesn't depend on the sample rate.
 *
 * W3C axes: a positive gz is counter-clockwise when you look at the screen. The event
 * reports `direction` 1 for clockwise and -1 for counter-clockwise, and `degrees` (always positive).
 */
export function createSpinDetector(customConfig?: Partial<SpinConfig>) {
  const config = { ...DEFAULT_SPIN_CONFIG, ...customConfig };
  const target = config.targetDegrees > 0 ? config.targetDegrees : DEFAULT_SPIN_CONFIG.targetDegrees;
  const windowMs = config.windowMs > 0 ? config.windowMs : DEFAULT_SPIN_CONFIG.windowMs;
  const cooldownMs = Math.max(0, config.cooldownMs);
  const maxGap = config.maxGapMs > 0 ? config.maxGapMs : DEFAULT_SPIN_CONFIG.maxGapMs;

  let steps: { t: number; deg: number }[] = [];
  let sum = 0;
  let last: { t: number; gz: number } | null = null;
  let lastEventTime: number | null = null;

  const clear = () => {
    steps = [];
    sum = 0;
  };

  return {
    push(s: Sample): GestureEvent[] {
      const { t, gz } = s;
      if (!Number.isFinite(t) || !Number.isFinite(gz)) return [];
      if (last && t < last.t) {
        clear();
        last = null;
      }
      if (last && t > last.t) {
        const dt = Math.min(t - last.t, maxGap);
        const deg = (((gz + last.gz) / 2) * dt) / 1000; // trapezoid
        steps.push({ t, deg });
        sum += deg;
      }
      last = { t, gz };
      const cutoff = t - windowMs;
      while (steps.length > 0 && steps[0]!.t < cutoff) sum -= steps.shift()!.deg;
      if (steps.length === 0) sum = 0; // avoid drift from float rounding

      if (Math.abs(sum) < target) return [];
      if (lastEventTime !== null && t - lastEventTime < cooldownMs) return [];
      const degrees = Math.abs(sum);
      const direction = sum > 0 ? -1 : 1;
      lastEventTime = t;
      clear();
      return [{ name: "spin", t, data: { direction, degrees } }];
    },
    reset(): void {
      clear();
      last = null;
      lastEventTime = null;
    },
  };
}

export const spinDetector = {
  name: "spin",
  defaults: DEFAULT_SPIN_CONFIG,
  create(config: Partial<SpinConfig> = DEFAULT_SPIN_CONFIG) {
    return createSpinDetector(config);
  },
} satisfies Detector<SpinConfig>;
