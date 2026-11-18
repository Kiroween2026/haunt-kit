# Requirements: protocol

Owner: Yadnesh. Package: `packages/protocol`. Changes after the freeze (Tue Nov 17) need all three owners to agree.

## Introduction

The protocol package defines every message sent between the phone controller, the relay server and the host app. All three sides import it, so a message that one side sends is always one the other side can read. Each message is validated with zod at the point where it crosses the network.

The existing `Sample`, `GestureEvent` and `Detector` types are a frozen contract and stay unchanged.

## Requirement 1: Message envelope

**User story:** As a developer of any Haunt Kit part, I want every message to carry a version and a type, so that I can reject messages I don't understand.

1. Every message SHALL have `v` (the protocol version, currently `1`) and `type` (a string).
2. WHEN a message has a `v` other than `1` THEN decoding SHALL fail with error code `unsupported_version`.
3. WHEN a message has a `type` not defined for that direction THEN decoding SHALL fail with error code `unknown_type`.
4. WHEN a message has fields that the schema doesn't define THEN decoding SHALL succeed and drop those fields.
5. WHEN the input is not valid JSON or not a JSON object THEN decoding SHALL fail with error code `bad_message`.
6. Decoding SHALL never throw. It SHALL return either a message or an error.

## Requirement 2: Message types

**User story:** As the platform owner, I want one list of message types per direction, so that each side only accepts messages that make sense for it.

1. Phone to relay: `join` (`roomCode`, optional `playerId` for rejoin, `name`, `device` {`os`, `browser`}), `sensor_frames` (a batch of `Sample`), `gesture` (`GestureEvent`), `ping`, `pong`.
2. Relay to phone: `welcome` (`playerId`, `color`, `roomCode`), `feedback` (flash a color, set a color, or play a sound id), `ui` (control view `tilt | still | scream | tap | wait`, plus `title` and `hint`), `ping`, `pong`, `error` (`code`, `message`).
3. Host to relay: `create_room`, `resume_room` (`roomCode`, `hostToken`), `feedback` and `ui` addressed to one `playerId` or `"all"`, `ping`, `pong`.
4. Relay to host: `room_ready` (`roomCode`, `hostToken`, current players), `player_joined`, `player_left` (`playerId`, `reason`), `sensor_frames` and `gesture` stamped with the sender's `playerId`, `ping`, `pong`, `error`.
5. Messages a phone sends SHALL NOT contain a `playerId` for frames or gestures. The relay adds the sender's `playerId` itself, so one player can't send input as another player.

## Requirement 3: Room codes

**User story:** As a player, I want a short room code that's easy to read and type, so that I can join without mistakes.

1. A room code SHALL be 4 uppercase letters from `A-Z` without `O`, `I` and `L`.
2. Room codes SHALL be generated with `crypto.getRandomValues`, with no bias toward any letter.
3. The package SHALL provide a function that turns typed input (lowercase, spaces) into a room code, or reports it as invalid.

## Requirement 4: Size limit

**User story:** As the platform owner, I want a hard size limit, so that a single message can't overload the relay.

1. The maximum message size SHALL be 16 KB (16,384 bytes of UTF-8).
2. WHEN a raw message is larger THEN decoding SHALL fail with `too_large` before parsing JSON.
3. WHEN code tries to encode a message larger than the limit THEN encoding SHALL throw.

## Requirement 5: Types and helpers

1. The package SHALL export zod schemas, TypeScript types inferred from them, and `encode`/`decode` helpers for each direction.
2. The zod `Sample` schema SHALL match the frozen `Sample` type exactly, checked at compile time.
3. Numbers in messages SHALL be finite.

## Requirement 6: Tests

1. Property test: for every message type in every direction, `decode(encode(m))` equals `m`.
2. Property test: generated room codes are always valid.
3. Property test: oversized messages are always rejected.
4. Property test: decoding any string never throws.
5. Property test: extra fields are ignored, and a phone can't add a `playerId` to its frames or gestures.
