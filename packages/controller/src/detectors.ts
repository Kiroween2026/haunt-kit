// Owner: Yadnesh. Detectors that run on the phone.
//
// shake, double-shake, flick, spin and flip are always on. hold-still only runs in the "still" view (see pipeline.ts).
// tilt and scream are not here: they are continuous, so the phone sends raw frames in those views.
// rep belongs to Steady, which runs on one phone in local mode.

import type { Detector } from "@haunt-kit/protocol";
import {
  doubleShakeDetector,
  flickDetector,
  flipDetector,
  holdStillDetector,
  shakeDetector,
  spinDetector,
} from "@haunt-kit/gestures/detectors";

export const PHONE_DETECTORS: readonly Detector<unknown>[] = [
  shakeDetector,
  doubleShakeDetector,
  flickDetector,
  spinDetector,
  flipDetector,
  holdStillDetector,
];
