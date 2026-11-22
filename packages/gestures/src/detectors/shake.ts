import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/**
 * Configuration options for the Shake Detector.
 */
export interface ShakeConfig {
  /**
   * Acceleration magnitude threshold in m/s² to qualify as a shake peak.
   * Default: 18.0 m/s² (approx 1.8g).
   */
  threshold: number;
  /**
   * Minimum number of qualifying peaks required to trigger a shake event.
   * Default: 3.
   */
  minPeaks: number;
  /**
   * Temporal sliding window duration in milliseconds.
   * Default: 600 ms.
   */
  windowMs: number;
  /**
   * Cooldown period in milliseconds after emitting a shake event.
   * Default: 400 ms.
   */
  cooldownMs: number;
}

/**
 * Default configuration values for the Shake Detector according to Kiro spec.
 */
export const DEFAULT_SHAKE_CONFIG: ShakeConfig = {
  threshold: 18.0,
  minPeaks: 3,
  windowMs: 600,
  cooldownMs: 400,
};

interface PeakRecord {
  t: number;
  magnitude: number;
}

/**
 * Minimum temporal separation between discrete peak excursions (ms)
 * to prevent high-frequency sample jitter within a single physical stroke
 * from being counted as multiple peaks.
 */
const MIN_PEAK_INTERVAL_MS = 50;

/**
 * Creates an instance of the Shake Detector state machine.
 */
export function createShakeDetector(customConfig?: Partial<ShakeConfig>) {
  const config: ShakeConfig = {
    ...DEFAULT_SHAKE_CONFIG,
    ...customConfig,
  };

  const threshold = config.threshold > 0 ? config.threshold : DEFAULT_SHAKE_CONFIG.threshold;
  const minPeaks = Math.max(1, Math.floor(config.minPeaks));
  const windowMs = config.windowMs > 0 ? config.windowMs : DEFAULT_SHAKE_CONFIG.windowMs;
  const cooldownMs = Math.max(0, config.cooldownMs);

  let peaks: PeakRecord[] = [];
  let inExcursion = false;
  let lastPeakTime: number | null = null;
  let lastEventTime: number | null = null;

  return {
    push(s: Sample): GestureEvent[] {
      const { ax, ay, az, t } = s;
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) || !Number.isFinite(t)) {
        return [];
      }

      // 1. Calculate 3D acceleration magnitude (rotation-invariant)
      const mag = Math.sqrt(ax * ax + ay * ay + az * az);

      // 2. Prune old peaks outside the sliding temporal window
      const windowCutoff = t - windowMs;
      while (peaks.length > 0 && peaks[0]!.t < windowCutoff) {
        peaks.shift();
      }

      // 3. Track qualifying peak excursions
      let registeredNewPeak = false;
      if (mag > threshold) {
        const timeSinceLastPeak = lastPeakTime !== null ? t - lastPeakTime : Infinity;

        if (!inExcursion || timeSinceLastPeak >= MIN_PEAK_INTERVAL_MS) {
          peaks.push({ t, magnitude: mag });
          lastPeakTime = t;
          inExcursion = true;
          registeredNewPeak = true;
        } else if (inExcursion && peaks.length > 0) {
          const currentPeak = peaks[peaks.length - 1]!;
          if (mag > currentPeak.magnitude) {
            currentPeak.magnitude = mag;
          }
        }
      } else {
        inExcursion = false;
      }

      // 4. Emit shake event if peak count requirement and cooldown are satisfied
      if (registeredNewPeak && peaks.length >= minPeaks) {
        const cooldownElapsed = lastEventTime === null || t - lastEventTime >= cooldownMs;

        if (cooldownElapsed) {
          const intensity = Math.max(...peaks.map((p) => p.magnitude));
          lastEventTime = t;
          peaks = [];
          inExcursion = false;

          return [
            {
              name: "shake",
              t,
              data: {
                intensity,
              },
            },
          ];
        }
      }

      return [];
    },

    reset(): void {
      peaks = [];
      inExcursion = false;
      lastPeakTime = null;
      lastEventTime = null;
    },
  };
}

/**
 * Shake Detector conforming to @haunt-kit/protocol Detector contract.
 */
export const shakeDetector = {
  name: "shake",
  defaults: DEFAULT_SHAKE_CONFIG,
  create(config: Partial<ShakeConfig> = DEFAULT_SHAKE_CONFIG) {
    return createShakeDetector(config);
  },
} satisfies Detector<ShakeConfig>;
