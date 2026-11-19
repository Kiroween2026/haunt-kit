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

export type {
  RecordingOS,
  RecordingMeta,
  GhostRecording,
} from "./recording/schema";

// Replay player
export { ReplayPlayer } from "./recording/player";
export type { PlayRealtimeOptions } from "./recording/player";

// MockTransport adapter for host-sdk & apps
export { createGhostPlayer } from "./recording/adapter";
export type {
  GhostPlayerAdapter,
  GhostPlayerOptions,
} from "./recording/adapter";
