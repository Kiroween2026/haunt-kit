// Owner: Anish. Pure gesture detectors, Ghost Recordings and replay.
// Only Anish changes this package. Ask the owner before editing (see .kiro/steering/structure.md).

export type { Sample, GestureEvent, Detector } from "@haunt-kit/protocol";
export { sampleSchema } from "@haunt-kit/protocol";

export const PACKAGE_NAME = "@haunt-kit/gestures";

// Ghost Recordings schema & types
export {
  RECORDING_OS,
  recordingMetaSchema,
  recordingSchema,
  RecordingMetaSchema,
  RecordingSchema,
} from "./recording/schema";

export type { RecordingOS, RecordingMeta, GhostRecording } from "./recording/schema";

// Replay player
export { ReplayPlayer } from "./recording/player";
export type { PlayRealtimeOptions } from "./recording/player";

// MockTransport adapter for host-sdk & apps
export { createGhostPlayer } from "./recording/adapter";
export type { GhostPlayerAdapter, GhostPlayerOptions } from "./recording/adapter";

// Detectors
export { DEFAULT_TILT_CONFIG, createTiltDetector, tiltDetector } from "./detectors/tilt";
export type { TiltConfig } from "./detectors/tilt";

export { DEFAULT_SHAKE_CONFIG, createShakeDetector, shakeDetector } from "./detectors/shake";
export type { ShakeConfig } from "./detectors/shake";

export {
  DEFAULT_HOLD_STILL_CONFIG,
  createHoldStillDetector,
  holdStillDetector,
} from "./detectors/hold-still";
export type { HoldStillConfig } from "./detectors/hold-still";

export {
  DEFAULT_FLICK_CONFIG,
  createFlickDetector,
  flickDetector,
  DEFAULT_SPIN_CONFIG,
  createSpinDetector,
  spinDetector,
  DEFAULT_FLIP_CONFIG,
  createFlipDetector,
  flipDetector,
  DEFAULT_SCREAM_CONFIG,
  createScreamDetector,
  screamDetector,
  createTapDetector,
  makeTapEvent,
  tapDetector,
  DEFAULT_REP_CONFIG,
  createRepDetector,
  repDetector,
  DEFAULT_DOUBLE_SHAKE_CONFIG,
  createDoubleShakeDetector,
  doubleShakeDetector,
} from "./detectors";
export type {
  FlickConfig,
  SpinConfig,
  FlipConfig,
  ScreamConfig,
  TapConfig,
  RepConfig,
  RepStatus,
  DoubleShakeConfig,
} from "./detectors";

// Catalog
export { GestureCatalog, catalog } from "./catalog";
export type { AnyDetector } from "./catalog";
