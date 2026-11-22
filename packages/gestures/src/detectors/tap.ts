// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
import type { Detector, GestureEvent } from "@haunt-kit/protocol";

/**
 * Tap comes from the touch screen, not the motion sensors, so this detector never reads samples.
 * The controller turns a touch into an event with makeTapEvent() and sends it as a gesture.
 */
export type TapConfig = Record<string, never>;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** A tap event with x and y as fractions of the screen (0..1). */
export function makeTapEvent(x: number, y: number, t: number): GestureEvent {
  return { name: "tap", t, data: { x: clamp01(x), y: clamp01(y) } };
}

export function createTapDetector() {
  return {
    push: (): GestureEvent[] => [],
    reset: (): void => {},
  };
}

export const tapDetector = {
  name: "tap",
  defaults: {} as TapConfig,
  create(_config: Partial<TapConfig> = {}) {
    return createTapDetector();
  },
} satisfies Detector<TapConfig>;
