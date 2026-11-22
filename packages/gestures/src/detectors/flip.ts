// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/** Configuration options for the Flip Detector. */
export interface FlipConfig {
  /** `az` below this means face-down, in m/s². Default: -7 */
  faceDownThreshold: number;
  /** The phone must stay in a state this long before it counts, in ms. Default: 200 */
  holdMs: number;
  /** `az` above this means face-up again, in m/s². Default: -3 (a gap prevents flicker) */
  releaseThreshold: number;
}

export const DEFAULT_FLIP_CONFIG: FlipConfig = {
  faceDownThreshold: -7,
  holdMs: 200,
  releaseThreshold: -3,
};

/**
 * Flip: the phone turned face-down. Fires `flip` with `faceDown: 1` after `holdMs` below the
 * threshold, and `faceDown: 0` after it has been back above the release threshold for `holdMs`.
 */
export function createFlipDetector(customConfig?: Partial<FlipConfig>) {
  const config = { ...DEFAULT_FLIP_CONFIG, ...customConfig };
  const down = config.faceDownThreshold;
  const release = Math.max(config.releaseThreshold, down); // the release level can't be below the trigger
  const holdMs = Math.max(0, config.holdMs);

  let faceDown = false;
  let pendingSince: number | null = null;

  return {
    push(s: Sample): GestureEvent[] {
      const { t, az } = s;
      if (!Number.isFinite(t) || !Number.isFinite(az)) return [];
      const wantsChange = faceDown ? az > release : az < down;
      if (!wantsChange) {
        pendingSince = null;
        return [];
      }
      pendingSince ??= t;
      if (t < pendingSince) pendingSince = t;
      if (t - pendingSince < holdMs) return [];
      faceDown = !faceDown;
      pendingSince = null;
      return [{ name: "flip", t, data: { faceDown: faceDown ? 1 : 0 } }];
    },
    reset(): void {
      faceDown = false;
      pendingSince = null;
    },
  };
}

export const flipDetector = {
  name: "flip",
  defaults: DEFAULT_FLIP_CONFIG,
  create(config: Partial<FlipConfig> = DEFAULT_FLIP_CONFIG) {
    return createFlipDetector(config);
  },
} satisfies Detector<FlipConfig>;
