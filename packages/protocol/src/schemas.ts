// Owner: Yadnesh. zod schemas for every Haunt Kit message.
// Changes need all three owners to agree (see .kiro/steering/protocol.md).

import { z } from "zod";
import type { GestureEvent, Sample } from "./types";
import { ROOM_CODE_PATTERN } from "./room-code";

// ---------- Shared shapes ----------

/** z.number() in zod 4 already rejects NaN and Infinity. */
const finite = z.number();

export const sampleSchema = z.object({
  t: finite,
  ax: finite,
  ay: finite,
  az: finite,
  gx: finite,
  gy: finite,
  gz: finite,
  alpha: finite,
  beta: finite,
  gamma: finite,
  rms: finite.min(0).max(1).optional(),
});

/** Gesture data keys: a letter, then up to 39 letters, digits or underscores. */
export const GESTURE_DATA_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export const gestureEventSchema = z.object({
  name: z.string().min(1).max(40),
  t: finite,
  // Keys must start with a letter, and "__proto__" is rejected. Otherwise zod drops that key
  // silently (prototype-pollution guard) and the host gets a different message than the phone sent.
  data: z
    .preprocess(
      // zod skips a "__proto__" key before checking key names, so catch it here.
      (v) => (v !== null && typeof v === "object" && Object.hasOwn(v, "__proto__") ? null : v),
      z.record(z.string().regex(GESTURE_DATA_KEY), finite),
    )
    .optional(),
});

// Compile-time guard: the zod types must equal the frozen contract types.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const sampleMatchesFrozenType: Equals<z.infer<typeof sampleSchema>, Sample> = true;
const gestureMatchesFrozenType: Equals<z.infer<typeof gestureEventSchema>, GestureEvent> = true;
void sampleMatchesFrozenType;
void gestureMatchesFrozenType;

export const roomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
export const playerIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Secret that lets a host get its room back after a disconnect. Never log it. */
export const hostTokenSchema = z.string().min(16).max(128);
export const playerNameSchema = z.string().min(1).max(20).regex(/\S/, "name must not be blank");

export const deviceSchema = z.object({
  os: z.enum(["ios", "android", "desktop", "other"]),
  browser: z.string().min(1).max(40),
});

export const playerInfoSchema = z.object({
  playerId: playerIdSchema,
  name: playerNameSchema,
  color: colorSchema,
  device: deviceSchema,
});

export const feedbackSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flash"), color: colorSchema, ms: z.int().min(1).max(2000).optional() }),
  z.object({ kind: z.literal("color"), color: colorSchema }),
  z.object({ kind: z.literal("sound"), soundId: z.string().min(1).max(40) }),
]);

export const CONTROL_VIEWS = ["tilt", "still", "scream", "tap", "wait"] as const;

export const uiViewSchema = z.object({
  view: z.enum(CONTROL_VIEWS),
  title: z.string().max(60).optional(),
  hint: z.string().max(120).optional(),
});

export const targetSchema = z.union([z.literal("all"), playerIdSchema]);

export const ERROR_CODES = [
  "bad_message",
  "unknown_type",
  "unsupported_version",
  "too_large",
  "room_not_found",
  "room_full",
  "rate_limited",
  "not_allowed",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

// ---------- Message helpers ----------

/** Builds a message schema with the v/type envelope. */
function message<T extends string, S extends z.ZodRawShape>(type: T, shape: S) {
  return z.object({ v: z.literal(1), type: z.literal(type), ...shape });
}

const ping = message("ping", { t: finite });
const pong = message("pong", { t: finite });
const error = message("error", { code: errorCodeSchema, message: z.string().max(200) });

/**
 * Max samples per sensor_frames batch: 1 second at 30 Hz, rounded up.
 * A worst-case sample (every number at full JSON length) is about 334 bytes, so 32 samples
 * stay near 10.7 KB, well under MAX_MESSAGE_BYTES. 64 would not fit (see codec.test.ts).
 */
export const MAX_SAMPLES_PER_BATCH = 32;
const samples = z.array(sampleSchema).min(1).max(MAX_SAMPLES_PER_BATCH);

// ---------- Channels ----------

/** Messages a phone sends to the relay. No playerId on input: the relay adds the sender's own id. */
export const phoneToRelaySchemas = {
  join: message("join", {
    roomCode: roomCodeSchema,
    playerId: playerIdSchema.optional(),
    name: playerNameSchema,
    device: deviceSchema,
  }),
  sensor_frames: message("sensor_frames", { samples }),
  gesture: message("gesture", { event: gestureEventSchema }),
  ping,
  pong,
};

/** Messages the relay sends to a phone. */
export const relayToPhoneSchemas = {
  welcome: message("welcome", { playerId: playerIdSchema, color: colorSchema, roomCode: roomCodeSchema }),
  feedback: message("feedback", { feedback: feedbackSchema }),
  ui: message("ui", { ui: uiViewSchema }),
  ping,
  pong,
  error,
};

/** Messages a host app sends to the relay. */
export const hostToRelaySchemas = {
  create_room: message("create_room", { maxPlayers: z.int().min(1).max(8).optional() }),
  resume_room: message("resume_room", { roomCode: roomCodeSchema, hostToken: hostTokenSchema }),
  feedback: message("feedback", { to: targetSchema, feedback: feedbackSchema }),
  ui: message("ui", { to: targetSchema, ui: uiViewSchema }),
  ping,
  pong,
};

/** Messages the relay sends to a host app. Player input is stamped with the sender's playerId. */
export const relayToHostSchemas = {
  room_ready: message("room_ready", {
    roomCode: roomCodeSchema,
    hostToken: hostTokenSchema,
    players: z.array(playerInfoSchema).max(8),
  }),
  player_joined: message("player_joined", { player: playerInfoSchema }),
  player_left: message("player_left", {
    playerId: playerIdSchema,
    reason: z.enum(["left", "timeout", "kicked"]),
  }),
  sensor_frames: message("sensor_frames", {
    playerId: playerIdSchema,
    samples,
  }),
  gesture: message("gesture", { playerId: playerIdSchema, event: gestureEventSchema }),
  ping,
  pong,
  error,
};

// ---------- Shared types ----------

export type Device = z.infer<typeof deviceSchema>;
export type PlayerInfo = z.infer<typeof playerInfoSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type UiView = z.infer<typeof uiViewSchema>;
export type ControlView = UiView["view"];
export type Target = z.infer<typeof targetSchema>;
