// Owner: Anish (built by Yadnesh while Anish is unavailable).
import type { RepConfig } from "@haunt-kit/gestures";

export type ExerciseId = "shoulder-raise" | "bicep-curl";

export type Exercise = {
  id: ExerciseId;
  name: string;
  /** One sentence on how to hold the phone. */
  holding: string;
  /** The rep detector's settings for this exercise. */
  rep: Partial<RepConfig>;
};

/**
 * Angles are how far the phone turns from the start position (arm down, or elbow straight).
 * A shoulder raise lifts the arm to about 90°. A curl turns the forearm through about 120°.
 */
export const EXERCISES: readonly Exercise[] = [
  {
    id: "shoulder-raise",
    name: "Shoulder raise",
    holding:
      "Hold the phone in your hand, arm down by your side. Raise your arm in front of you, then lower it.",
    rep: { minRomDeg: 45, targetRomDeg: 80, hysteresisDeg: 10, minTempoSec: 1.5 },
  },
  {
    id: "bicep-curl",
    name: "Bicep curl",
    holding:
      "Hold the phone in your hand, arm straight down. Bend your elbow to lift the phone toward your shoulder, then lower it.",
    rep: { minRomDeg: 60, targetRomDeg: 100, hysteresisDeg: 12, minTempoSec: 1.5 },
  },
];

export const exerciseById = (id: string): Exercise | undefined => EXERCISES.find((e) => e.id === id);
