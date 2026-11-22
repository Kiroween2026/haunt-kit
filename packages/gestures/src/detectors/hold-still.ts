import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/**
 * Configuration options for the Hold-Still Detector.
 */
export interface HoldStillConfig {
  /**
   * Maximum acceleration vector variance threshold in (m/s²)² to qualify as still.
   * Default: 0.4 m/s².
   */
  varianceThreshold: number;
  /**
   * Continuous duration in milliseconds that variance must remain below
   * the threshold to emit a hold-still event.
   * Default: 1200 ms.
   */
  holdDurationMs: number;
  /**
   * Sliding temporal window duration in milliseconds.
   * Defaults to holdDurationMs.
   */
  windowMs?: number;
}

/**
 * Default configuration values for the Hold-Still Detector according to Kiro spec.
 */
export const DEFAULT_HOLD_STILL_CONFIG: HoldStillConfig = {
  varianceThreshold: 0.4,
  holdDurationMs: 1200,
};

interface SamplePoint {
  t: number;
  ax: number;
  ay: number;
  az: number;
}

/**
 * Creates an instance of the Hold-Still Detector state machine.
 */
export function createHoldStillDetector(customConfig?: Partial<HoldStillConfig>) {
  const config: HoldStillConfig = {
    ...DEFAULT_HOLD_STILL_CONFIG,
    ...customConfig,
  };

  const varianceThreshold =
    config.varianceThreshold > 0 ? config.varianceThreshold : DEFAULT_HOLD_STILL_CONFIG.varianceThreshold;

  const holdDurationMs =
    config.holdDurationMs > 0 ? config.holdDurationMs : DEFAULT_HOLD_STILL_CONFIG.holdDurationMs;

  const windowMs = config.windowMs && config.windowMs > 0 ? config.windowMs : holdDurationMs;

  let buffer: SamplePoint[] = [];
  let isHoldingStill = false;

  return {
    push(s: Sample): GestureEvent[] {
      const { ax, ay, az, t } = s;
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) || !Number.isFinite(t)) {
        return [];
      }

      // 1. Reset if timestamp moves backwards
      if (buffer.length > 0 && t < buffer[buffer.length - 1]!.t) {
        buffer = [];
        isHoldingStill = false;
      }

      // 2. Add current sample to sliding temporal buffer
      buffer.push({ t, ax, ay, az });

      // 3. Prune samples older than window duration
      const cutoff = t - windowMs;
      while (buffer.length > 0 && buffer[0]!.t < cutoff) {
        buffer.shift();
      }

      if (buffer.length < 2) {
        return [];
      }

      const timeSpan = buffer[buffer.length - 1]!.t - buffer[0]!.t;

      // 4. Compute 3D acceleration vector variance: Var(ax) + Var(ay) + Var(az)
      const n = buffer.length;
      let sumAx = 0;
      let sumAy = 0;
      let sumAz = 0;

      for (let i = 0; i < n; i++) {
        const item = buffer[i]!;
        sumAx += item.ax;
        sumAy += item.ay;
        sumAz += item.az;
      }

      const meanAx = sumAx / n;
      const meanAy = sumAy / n;
      const meanAz = sumAz / n;

      let varSum = 0;
      for (let i = 0; i < n; i++) {
        const item = buffer[i]!;
        const dAx = item.ax - meanAx;
        const dAy = item.ay - meanAy;
        const dAz = item.az - meanAz;
        varSum += dAx * dAx + dAy * dAy + dAz * dAz;
      }

      const variance = varSum / n;
      const cleanVariance = Object.is(variance, -0) || variance === 0 ? 0 : variance;

      // 5. State transitions
      if (variance <= varianceThreshold) {
        // Only trigger hold-still if stillness has persisted for at least holdDurationMs
        if (!isHoldingStill && timeSpan >= holdDurationMs) {
          isHoldingStill = true;
          return [
            {
              name: "hold-still",
              t,
              data: {
                state: 1,
                variance: cleanVariance,
              },
            },
          ];
        }
      } else {
        // Motion exceeded threshold
        if (isHoldingStill) {
          isHoldingStill = false;
          return [
            {
              name: "hold-still-broken",
              t,
              data: {
                state: 0,
                variance: cleanVariance,
              },
            },
          ];
        }
      }

      return [];
    },

    reset(): void {
      buffer = [];
      isHoldingStill = false;
    },
  };
}

/**
 * Hold-Still Detector conforming to @haunt-kit/protocol Detector contract.
 */
export const holdStillDetector = {
  name: "hold-still",
  defaults: DEFAULT_HOLD_STILL_CONFIG,
  create(config: Partial<HoldStillConfig> = DEFAULT_HOLD_STILL_CONFIG) {
    return createHoldStillDetector(config);
  },
} satisfies Detector<HoldStillConfig>;
