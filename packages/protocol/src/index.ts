// Owner: Yadnesh. Shared message contract between phone controller, relay and host apps.
// Changes need all three owners to agree. See .kiro/steering/protocol.md.

export { PROTOCOL_VERSION } from "./types";
export type { Sample, GestureEvent, Detector } from "./types";

export {
  MAX_MESSAGE_BYTES,
  ProtocolError,
  byteLength,
  createChannel,
  hostToRelay,
  phoneToRelay,
  relayToHost,
  relayToPhone,
} from "./codec";
export type {
  Channel,
  DecodeResult,
  ErrorCode,
  HostToRelayMessage,
  PhoneToRelayMessage,
  RelayToHostMessage,
  RelayToPhoneMessage,
} from "./codec";

export {
  CONTROL_VIEWS,
  ERROR_CODES,
  MAX_SAMPLES_PER_BATCH,
  colorSchema,
  deviceSchema,
  errorCodeSchema,
  feedbackSchema,
  gestureEventSchema,
  hostToRelaySchemas,
  hostTokenSchema,
  phoneToRelaySchemas,
  playerIdSchema,
  playerInfoSchema,
  playerNameSchema,
  relayToHostSchemas,
  relayToPhoneSchemas,
  roomCodeSchema,
  sampleSchema,
  targetSchema,
  uiViewSchema,
} from "./schemas";

export type { ControlView, Device, Feedback, PlayerInfo, Target, UiView } from "./schemas";

export {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  generateRoomCode,
  isRoomCode,
  normalizeRoomCode,
} from "./room-code";
export type { RandomBytes } from "./room-code";
