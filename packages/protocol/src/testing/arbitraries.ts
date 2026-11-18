// Test-only fast-check generators for every protocol message. Not exported from the package.

import fc from "fast-check";
import type { Sample, GestureEvent } from "../types";
import { ROOM_CODE_ALPHABET } from "../room-code";
import type {
  HostToRelayMessage,
  PhoneToRelayMessage,
  RelayToHostMessage,
  RelayToPhoneMessage,
} from "../codec";
import {
  CONTROL_VIEWS,
  ERROR_CODES,
  MAX_SAMPLES_PER_BATCH,
  type Feedback,
  type PlayerInfo,
  type UiView,
} from "../schemas";

// JSON has no -0 (JSON.stringify(-0) === "0"). For sensor data -0 and 0 mean the same,
// so generators map -0 to 0. Otherwise round-trip tests fail on a difference that doesn't matter.
const noNegZero = (n: number) => (Object.is(n, -0) ? 0 : n);

export const finiteArb = fc.double({ noNaN: true, noDefaultInfinity: true }).map(noNegZero);
export const rmsArb = fc.double({ min: 0, max: 1, noNaN: true }).map(noNegZero);

export const sampleArb: fc.Arbitrary<Sample> = fc.record(
  {
    t: finiteArb,
    ax: finiteArb,
    ay: finiteArb,
    az: finiteArb,
    gx: finiteArb,
    gy: finiteArb,
    gz: finiteArb,
    alpha: finiteArb,
    beta: finiteArb,
    gamma: finiteArb,
    rms: rmsArb,
  },
  { requiredKeys: ["t", "ax", "ay", "az", "gx", "gy", "gz", "alpha", "beta", "gamma"] },
);

export const gestureEventArb: fc.Arbitrary<GestureEvent> = fc.record(
  {
    name: fc.string({ minLength: 1, maxLength: 40 }),
    t: finiteArb,
    data: fc.dictionary(fc.string({ maxLength: 40 }), finiteArb, { maxKeys: 8 }),
  },
  { requiredKeys: ["name", "t"] },
);

export const roomCodeArb = fc
  .array(fc.constantFrom(...ROOM_CODE_ALPHABET), { minLength: 4, maxLength: 4 })
  .map((letters) => letters.join(""));

const idChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
export const playerIdArb = fc
  .array(fc.constantFrom(...idChars), { minLength: 8, maxLength: 64 })
  .map((c) => c.join(""));
export const hostTokenArb = fc
  .array(fc.constantFrom(...idChars), { minLength: 16, maxLength: 128 })
  .map((c) => c.join(""));
export const colorArb = fc
  .array(fc.constantFrom(..."0123456789abcdefABCDEF"), { minLength: 6, maxLength: 6 })
  .map((c) => "#" + c.join(""));
export const nameArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /\S/.test(s));
export const deviceArb = fc.record({
  os: fc.constantFrom("ios" as const, "android" as const, "desktop" as const, "other" as const),
  browser: fc.string({ minLength: 1, maxLength: 40 }),
});
export const playerInfoArb: fc.Arbitrary<PlayerInfo> = fc.record({
  playerId: playerIdArb,
  name: nameArb,
  color: colorArb,
  device: deviceArb,
});
export const feedbackArb: fc.Arbitrary<Feedback> = fc.oneof(
  fc.record(
    { kind: fc.constant("flash" as const), color: colorArb, ms: fc.integer({ min: 1, max: 2000 }) },
    { requiredKeys: ["kind", "color"] },
  ),
  fc.record({ kind: fc.constant("color" as const), color: colorArb }),
  fc.record({ kind: fc.constant("sound" as const), soundId: fc.string({ minLength: 1, maxLength: 40 }) }),
);
export const uiArb: fc.Arbitrary<UiView> = fc.record(
  {
    view: fc.constantFrom(...CONTROL_VIEWS),
    title: fc.string({ maxLength: 60 }),
    hint: fc.string({ maxLength: 120 }),
  },
  { requiredKeys: ["view"] },
);
export const targetArb = fc.oneof(fc.constant("all" as const), playerIdArb);
const samplesArb = fc.array(sampleArb, { minLength: 1, maxLength: MAX_SAMPLES_PER_BATCH });
const pingArb = fc.record({ v: fc.constant(1 as const), type: fc.constant("ping" as const), t: finiteArb });
const pongArb = fc.record({ v: fc.constant(1 as const), type: fc.constant("pong" as const), t: finiteArb });
const errorArb = fc.record({
  v: fc.constant(1 as const),
  type: fc.constant("error" as const),
  code: fc.constantFrom(...ERROR_CODES),
  message: fc.string({ maxLength: 200 }),
});

const v = fc.constant(1 as const);

export const phoneToRelayArbs: Record<PhoneToRelayMessage["type"], fc.Arbitrary<PhoneToRelayMessage>> = {
  join: fc.record(
    {
      v,
      type: fc.constant("join" as const),
      roomCode: roomCodeArb,
      playerId: playerIdArb,
      name: nameArb,
      device: deviceArb,
    },
    { requiredKeys: ["v", "type", "roomCode", "name", "device"] },
  ),
  sensor_frames: fc.record({ v, type: fc.constant("sensor_frames" as const), samples: samplesArb }),
  gesture: fc.record({ v, type: fc.constant("gesture" as const), event: gestureEventArb }),
  ping: pingArb,
  pong: pongArb,
};

export const relayToPhoneArbs: Record<RelayToPhoneMessage["type"], fc.Arbitrary<RelayToPhoneMessage>> = {
  welcome: fc.record({
    v,
    type: fc.constant("welcome" as const),
    playerId: playerIdArb,
    color: colorArb,
    roomCode: roomCodeArb,
  }),
  feedback: fc.record({ v, type: fc.constant("feedback" as const), feedback: feedbackArb }),
  ui: fc.record({ v, type: fc.constant("ui" as const), ui: uiArb }),
  ping: pingArb,
  pong: pongArb,
  error: errorArb,
};

export const hostToRelayArbs: Record<HostToRelayMessage["type"], fc.Arbitrary<HostToRelayMessage>> = {
  create_room: fc.record(
    { v, type: fc.constant("create_room" as const), maxPlayers: fc.integer({ min: 1, max: 8 }) },
    { requiredKeys: ["v", "type"] },
  ),
  resume_room: fc.record({
    v,
    type: fc.constant("resume_room" as const),
    roomCode: roomCodeArb,
    hostToken: hostTokenArb,
  }),
  feedback: fc.record({ v, type: fc.constant("feedback" as const), to: targetArb, feedback: feedbackArb }),
  ui: fc.record({ v, type: fc.constant("ui" as const), to: targetArb, ui: uiArb }),
  ping: pingArb,
  pong: pongArb,
};

export const relayToHostArbs: Record<RelayToHostMessage["type"], fc.Arbitrary<RelayToHostMessage>> = {
  room_ready: fc.record({
    v,
    type: fc.constant("room_ready" as const),
    roomCode: roomCodeArb,
    hostToken: hostTokenArb,
    players: fc.array(playerInfoArb, { maxLength: 8 }),
  }),
  player_joined: fc.record({ v, type: fc.constant("player_joined" as const), player: playerInfoArb }),
  player_left: fc.record({
    v,
    type: fc.constant("player_left" as const),
    playerId: playerIdArb,
    reason: fc.constantFrom("left" as const, "timeout" as const, "kicked" as const),
  }),
  sensor_frames: fc.record({
    v,
    type: fc.constant("sensor_frames" as const),
    playerId: playerIdArb,
    samples: samplesArb,
  }),
  gesture: fc.record({
    v,
    type: fc.constant("gesture" as const),
    playerId: playerIdArb,
    event: gestureEventArb,
  }),
  ping: pingArb,
  pong: pongArb,
  error: errorArb,
};
