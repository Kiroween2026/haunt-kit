// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/** Configuration options for the Flick Detector. */
export interface FlickConfig {
  /** Minimum rate of change of the acceleration vector, in m/s³. Default: 35 */
  jerkThreshold: number;
  /** The change must happen within this window, in ms. Default: 150 */
  windowMs: number;
  /** Quiet time after a flick, in ms. Default: 500 */
  cooldownMs: number;
  /**
   * Minimum size of the acceleration change, in m/s². Without it, sensor noise sampled at
   * 120 Hz would pass the jerk threshold on its own. Default: 8
   */
  minDeltaMs2: number;
}

export const DEFAULT_FLICK_CONFIG: FlickConfig = {
  jerkThreshold: 35,
  windowMs: 150,
  cooldownMs: 500,
  minDeltaMs2: 8,
};

/** Samples closer than this are not compared with each other (avoids dividing by tiny dt). */
const MIN_COMPARE_MS = 10;

/**
 * Flick: one sharp acceleration change. Reports `direction` of the change
 * (0 left, 1 right, 2 up, 3 down, 4 forward/back) and its `magnitude` in m/s².
 * Axes follow the W3C convention: +x right, +y toward the top of the phone, z out of the screen.
 */
export function createFlickDetector(customConfig?: Partial<FlickConfig>) {
  const config = { ...DEFAULT_FLICK_CONFIG, ...customConfig };
  const jerkThreshold = config.jerkThreshold > 0 ? config.jerkThreshold : DEFAULT_FLICK_CONFIG.jerkThreshold;
  const windowMs = config.windowMs > 0 ? config.windowMs : DEFAULT_FLICK_CONFIG.windowMs;
  const cooldownMs = Math.max(0, config.cooldownMs);
  const minDelta = config.minDeltaMs2 > 0 ? config.minDeltaMs2 : DEFAULT_FLICK_CONFIG.minDeltaMs2;

  let buffer: { t: number; ax: number; ay: number; az: number }[] = [];
  let lastEventTime: number | null = null;

  return {
    push(s: Sample): GestureEvent[] {
      const { t, ax, ay, az } = s;
      if (![t, ax, ay, az].every(Number.isFinite)) return [];
      if (buffer.length > 0 && t < buffer[buffer.length - 1]!.t) buffer = [];
      // Motion during the cooldown is dropped. Otherwise a flick made during the cooldown would
      // be reported late, the moment the cooldown ends.
      if (lastEventTime !== null && t - lastEventTime < cooldownMs) {
        buffer = [];
        return [];
      }
      buffer.push({ t, ax, ay, az });
      const cutoff = t - windowMs;
      while (buffer.length > 0 && buffer[0]!.t < cutoff) buffer.shift();

      let best: { dx: number; dy: number; dz: number; delta: number } | null = null;
      for (const b of buffer) {
        const dt = t - b.t;
        if (dt < MIN_COMPARE_MS) continue;
        const dx = ax - b.ax;
        const dy = ay - b.ay;
        const dz = az - b.az;
        const delta = Math.hypot(dx, dy, dz);
        if (delta >= minDelta && delta / (dt / 1000) >= jerkThreshold && (!best || delta > best.delta)) {
          best = { dx, dy, dz, delta };
        }
      }
      if (!best) return [];

      const { dx, dy, dz, delta } = best;
      let direction: number;
      if (Math.abs(dz) >= Math.abs(dx) && Math.abs(dz) >= Math.abs(dy)) direction = 4;
      else if (Math.abs(dx) >= Math.abs(dy)) direction = dx > 0 ? 1 : 0;
      else direction = dy > 0 ? 2 : 3;
      lastEventTime = t;
      buffer = [];
      return [{ name: "flick", t, data: { direction, magnitude: delta } }];
    },
    reset(): void {
      buffer = [];
      lastEventTime = null;
    },
  };
}

export const flickDetector = {
  name: "flick",
  defaults: DEFAULT_FLICK_CONFIG,
  create(config: Partial<FlickConfig> = DEFAULT_FLICK_CONFIG) {
    return createFlickDetector(config);
  },
} satisfies Detector<FlickConfig>;
