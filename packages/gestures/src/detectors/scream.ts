// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/** Configuration options for the Scream Detector. */
export interface ScreamConfig {
  /** Loudness (rms, 0..1) that counts as screaming. Default: 0.65 */
  rmsThreshold: number;
  /** It must stay that loud this long, in ms. Default: 300 */
  minDurationMs: number;
  /** Quiet time after a scream, in ms. Default: 1000 */
  cooldownMs: number;
}

export const DEFAULT_SCREAM_CONFIG: ScreamConfig = {
  rmsThreshold: 0.65,
  minDurationMs: 300,
  cooldownMs: 1000,
};

/**
 * Scream: `rms` (computed on the phone) stays above the threshold for `minDurationMs`.
 * Fires once per scream, with `peak` and `average` loudness, and fires again only after the
 * sound has dropped below the threshold and the cooldown has passed.
 * A sample without `rms` counts as silence.
 */
export function createScreamDetector(customConfig?: Partial<ScreamConfig>) {
  const config = { ...DEFAULT_SCREAM_CONFIG, ...customConfig };
  const threshold = config.rmsThreshold > 0 ? config.rmsThreshold : DEFAULT_SCREAM_CONFIG.rmsThreshold;
  const minDuration = Math.max(0, config.minDurationMs);
  const cooldownMs = Math.max(0, config.cooldownMs);

  let runStart: number | null = null;
  let peak = 0;
  let weighted = 0; // sum of rms * dt
  let elapsed = 0;
  let prevT: number | null = null;
  let fired = false; // already fired during this loud run
  let lastEventTime: number | null = null;

  const endRun = () => {
    runStart = null;
    peak = 0;
    weighted = 0;
    elapsed = 0;
    fired = false;
  };

  return {
    push(s: Sample): GestureEvent[] {
      const { t } = s;
      if (!Number.isFinite(t)) return [];
      const rms = typeof s.rms === "number" && Number.isFinite(s.rms) ? Math.min(1, Math.max(0, s.rms)) : 0;
      if (prevT !== null && t < prevT) endRun();
      const dt = prevT !== null && t > prevT ? t - prevT : 0;
      prevT = t;

      if (rms < threshold) {
        endRun();
        return [];
      }
      runStart ??= t;
      peak = Math.max(peak, rms);
      weighted += rms * dt;
      elapsed += dt;
      if (fired || t - runStart < minDuration) return [];
      if (lastEventTime !== null && t - lastEventTime < cooldownMs) return [];
      fired = true;
      lastEventTime = t;
      const average = elapsed > 0 ? weighted / elapsed : rms;
      return [{ name: "scream", t, data: { peak, average } }];
    },
    reset(): void {
      endRun();
      prevT = null;
      lastEventTime = null;
    },
  };
}

export const screamDetector = {
  name: "scream",
  defaults: DEFAULT_SCREAM_CONFIG,
  create(config: Partial<ScreamConfig> = DEFAULT_SCREAM_CONFIG) {
    return createScreamDetector(config);
  },
} satisfies Detector<ScreamConfig>;
