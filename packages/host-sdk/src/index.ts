// Owner: Yadnesh. Host SDK: everything an app needs to get phone input.
//
//   const room = await createRoom({ relayUrl, controllerUrl });   // real phones
//   const room = await createMockRoom({ ghosts: [{ name: "Casper" }] });  // no relay, fake players
//   const room = createLocalSession(); await room.start();          // this phone (Steady)
//   room.on("frames", ({ playerId, samples }) => ...);

export { createRoom, HostSession, joinUrlFor } from "./session";
export type { CreateRoomOptions, HauntRoom, RoomEvents, RoomStatus } from "./session";
export { createMockRelay, createMockRoom } from "./mock";
export type { MockGhost, MockRelay, MockRoom } from "./mock";
export { createLocalSession, LOCAL_PLAYER_ID } from "./local";
export type { LocalSession, LocalSessionOptions } from "./local";
export { GhostPlayer, ghostRecordingSchema, parseRecording, synthRecording } from "./ghost";
export type { GhostOptions, GhostRecording, SynthKind } from "./ghost";
export { qrSvg } from "./qr";
export { backoffDelay } from "./backoff";
export { Emitter } from "./emitter";

// Device helpers (shared with the phone controller)
export { ACCEL_SIGN, detectBrowser, detectOs, normalizeSample } from "./device/normalize";
export type { Os, RawMotion, RawOrientation } from "./device/normalize";
export { rmsOf } from "./device/rms";
export { FLUSH_MS, FrameBatcher, SAMPLE_HZ } from "./device/batcher";
export { KeepAwake, MicMeter, MotionSampler, currentDevice, requestSensorAccess } from "./device/browser";
export type { Permission, SensorAccess } from "./device/browser";

// Transport (for tests and custom setups)
export { relayEndpoint, webSocketTransport, createMemoryRelay } from "@haunt-kit/relay/core";
export type { Transport, TransportFactory } from "@haunt-kit/relay/core";

// Protocol types apps commonly need
export type {
  Feedback,
  GestureEvent,
  PlayerInfo,
  Sample,
  Target,
  UiView,
  ControlView,
} from "@haunt-kit/protocol";
