// Built from packages/gestures/specs/double-shake.gesture.md (gesture-from-spec workflow).
// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";
import { DEFAULT_SHAKE_CONFIG, createShakeDetector } from "./shake";

export interface DoubleShakeConfig {
  /** Peak size for a shake, in m/s² (same as `shake`). Default: 18 */
  threshold: number;
  /** Peaks in one burst (same as `shake`). Default: 3 */
  minPeaks: number;
  /** Calm time needed between the two bursts, in ms. Default: 300 */
  pauseMs: number;
  /** The second burst must be detected within this time of the first, in ms. Default: 2500 */
  windowMs: number;
  /** Acceleration within this of gravity counts as calm, in m/s². Default: 4 */
  calmDelta: number;
  /** Quiet time after a double shake, in ms. Default: 1000 */
  cooldownMs: number;
}

export const DEFAULT_DOUBLE_SHAKE_CONFIG: DoubleShakeConfig = {
  threshold: DEFAULT_SHAKE_CONFIG.threshold,
  minPeaks: DEFAULT_SHAKE_CONFIG.minPeaks,
  pauseMs: 300,
  windowMs: 2500,
  calmDelta: 4,
  cooldownMs: 1000,
};

const GRAVITY = 9.81;

/**
 * Double shake: two shake bursts with a calm pause between them.
 * Uses the `shake` detector to find bursts. A burst with no calm pause before the next one
 * (one long shake) counts once.
 */
export function createDoubleShakeDetector(customConfig?: Partial<DoubleShakeConfig>) {
  const config = { ...DEFAULT_DOUBLE_SHAKE_CONFIG, ...customConfig };
  const pauseMs = Math.max(0, config.pauseMs);
  const windowMs = config.windowMs > 0 ? config.windowMs : DEFAULT_DOUBLE_SHAKE_CONFIG.windowMs;
  const calmDelta = config.calmDelta > 0 ? config.calmDelta : DEFAULT_DOUBLE_SHAKE_CONFIG.calmDelta;
  const cooldownMs = Math.max(0, config.cooldownMs);
  const makeShake = () =>
    createShakeDetector({ threshold: config.threshold, minPeaks: config.minPeaks, cooldownMs: 0 });

  let shake = makeShake();
  let firstBurstAt: number | null = null; // when the first burst was detected
  let lastLoudAt: number | null = null; // last time the phone was not calm
  let calmSeen = false; // a calm pause of pauseMs happened after the first burst
  let lastEventTime: number | null = null;

  const forgetFirst = () => {
    firstBurstAt = null;
    calmSeen = false;
  };

  return {
    push(s: Sample): GestureEvent[] {
      const { t, ax, ay, az } = s;
      if (![t, ax, ay, az].every(Number.isFinite)) return [];
      if (lastLoudAt !== null && t < lastLoudAt) this.reset();

      const loud = Math.abs(Math.hypot(ax, ay, az) - GRAVITY) > calmDelta;
      if (loud) lastLoudAt = t;
      else if (firstBurstAt !== null && lastLoudAt !== null && t - lastLoudAt >= pauseMs) calmSeen = true;
      if (firstBurstAt !== null && t - firstBurstAt > windowMs) forgetFirst();

      const bursts = shake.push(s);
      if (bursts.length === 0) return [];
      if (lastEventTime !== null && t - lastEventTime < cooldownMs) return [];

      if (firstBurstAt === null) {
        firstBurstAt = t;
        calmSeen = false;
        return [];
      }
      if (!calmSeen) return []; // the same burst, still going
      const gapMs = t - firstBurstAt;
      forgetFirst();
      lastEventTime = t;
      return [{ name: "double-shake", t, data: { gapMs } }];
    },
    reset(): void {
      shake = makeShake();
      forgetFirst();
      lastLoudAt = null;
      lastEventTime = null;
    },
  };
}

export const doubleShakeDetector = {
  name: "double-shake",
  defaults: DEFAULT_DOUBLE_SHAKE_CONFIG,
  create(config: Partial<DoubleShakeConfig> = DEFAULT_DOUBLE_SHAKE_CONFIG) {
    return createDoubleShakeDetector(config);
  },
} satisfies Detector<DoubleShakeConfig>;
