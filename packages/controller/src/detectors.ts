// Owner: Yadnesh. Detectors bundled into the phone controller.
//
// TODO(Anish's gestures merge): import the catalog from @haunt-kit/gestures and list the
// phone-side detectors here, e.g.
//   import { catalog } from "@haunt-kit/gestures";
//   export const PHONE_DETECTORS = ["shake", "flick", "spin", "flip", "hold-still"].map((n) => catalog[n]);
// Until then the list is empty, and the pipeline falls back to raw frames for "still".

import type { Detector } from "@haunt-kit/protocol";

export const PHONE_DETECTORS: readonly Detector<unknown>[] = [];
