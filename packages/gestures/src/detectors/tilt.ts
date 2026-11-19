import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/**
 * Configuration options for the Tilt Detector.
 */
export interface TiltConfig {
  /** Maximum roll angle in degrees corresponding to x = ±1.0. Default: 45 */
  maxRollDeg: number;
  /** Maximum pitch angle in degrees corresponding to y = ±1.0. Default: 45 */
  maxPitchDeg: number;
  /** Center dead zone radius (0.0 to 1.0) clamped to (0, 0). Default: 0.08 */
  deadZone: number;
  /**
   * Exponential moving average (EMA) smoothing factor (0.0 to 1.0).
   * Default: 0.2. Values <= 0 or >= 1 disable smoothing.
   */
  smoothingFactor: number;
}

/**
 * Default configuration values for the Tilt Detector according to Kiro spec.
 */
export const DEFAULT_TILT_CONFIG: TiltConfig = {
  maxRollDeg: 45,
  maxPitchDeg: 45,
  deadZone: 0.08,
  smoothingFactor: 0.2,
};

/**
 * Creates an instance of the Tilt Detector state machine.
 */
export function createTiltDetector(customConfig?: Partial<TiltConfig>) {
  const config: TiltConfig = {
    ...DEFAULT_TILT_CONFIG,
    ...customConfig,
  };

  const maxRoll = config.maxRollDeg > 0 ? config.maxRollDeg : 45;
  const maxPitch = config.maxPitchDeg > 0 ? config.maxPitchDeg : 45;
  const deadZone = Math.max(0, config.deadZone);
  const alpha = config.smoothingFactor;
  const useSmoothing = alpha > 0 && alpha < 1;

  let smoothedX: number | null = null;
  let smoothedY: number | null = null;

  return {
    push(s: Sample): GestureEvent[] {
      // 1. Raw normalized coordinates (-1.0 to 1.0)
      const rawX = Math.max(-1, Math.min(1, s.gamma / maxRoll));
      const rawY = Math.max(-1, Math.min(1, s.beta / maxPitch));

      // 2. EMA smoothing
      if (!useSmoothing || smoothedX === null || smoothedY === null) {
        smoothedX = rawX;
        smoothedY = rawY;
      } else {
        smoothedX = alpha * rawX + (1 - alpha) * smoothedX;
        smoothedY = alpha * rawY + (1 - alpha) * smoothedY;
      }

      // 3. Center dead zone
      let outX = smoothedX;
      let outY = smoothedY;
      const mag = Math.hypot(outX, outY);
      if (mag <= deadZone) {
        outX = 0;
        outY = 0;
      }

      // 4. Normalize -0 to 0
      const finalX = Object.is(outX, -0) || outX === 0 ? 0 : outX;
      const finalY = Object.is(outY, -0) || outY === 0 ? 0 : outY;

      return [
        {
          name: "tilt",
          t: s.t,
          data: {
            x: finalX,
            y: finalY,
          },
        },
      ];
    },

    reset(): void {
      smoothedX = null;
      smoothedY = null;
    },
  };
}

/**
 * Tilt Detector conforming to @haunt-kit/protocol Detector contract.
 */
export const tiltDetector = {
  name: "tilt",
  defaults: DEFAULT_TILT_CONFIG,
  create(config: Partial<TiltConfig> = DEFAULT_TILT_CONFIG) {
    return createTiltDetector(config);
  },
} satisfies Detector<TiltConfig>;
