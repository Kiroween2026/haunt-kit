# Design: protocol

## Overview

`packages/protocol` is a small pure TypeScript library with one runtime dependency, zod. It has no browser or Node APIs except `crypto.getRandomValues` (available in browsers, Workers and Node 22).

```
phone (controller) ──PhoneToRelay──▶ relay ──RelayToHost──▶ host app (host-sdk)
phone (controller) ◀──RelayToPhone── relay ◀──HostToRelay── host app (host-sdk)
```

Each arrow is a **channel**: a set of message schemas keyed by `type`. A side only decodes messages with the channel it receives on, so for example a phone can never send `room_ready`.

## Files

| File                         | Contents                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `src/index.ts`               | Frozen `Sample`, `GestureEvent`, `Detector` types, `PROTOCOL_VERSION`, re-exports |
| `src/schemas.ts`             | zod schemas for shared parts and every message, grouped into the four channels    |
| `src/codec.ts`               | `createChannel`, `encode`, `decode`, `MAX_MESSAGE_BYTES`, error codes             |
| `src/room-code.ts`           | `generateRoomCode`, `isRoomCode`, `normalizeRoomCode`                             |
| `src/testing/arbitraries.ts` | fast-check generators for every message (test-only, not exported)                 |

## Shared shapes

- `Sample`: the frozen type, every field a finite number, `rms` in 0..1.
- `GestureEvent`: `name` (1–40 chars), `t`, optional `data` (string → finite number).
- `PlayerId`: 8–64 chars of `A-Z a-z 0-9 _ -`. The relay creates it.
- `Color`: `#rrggbb`.
- `Device`: `os` is `ios | android | desktop | other`; `browser` is 1–40 chars.
- `PlayerInfo`: `playerId`, `name`, `color`, `device`. Used in `room_ready` and `player_joined`.
- `Feedback`: one of `{ kind: "flash", color, ms? }`, `{ kind: "color", color }`, `{ kind: "sound", soundId }`. `ms` is 1–2000.
- `UiView`: `{ view: "tilt" | "still" | "scream" | "tap" | "wait", title?, hint? }`. `title` is up to 60 chars, `hint` up to 120.
- `Target`: a `PlayerId` or `"all"`.
- Error codes: `bad_message`, `unknown_type`, `unsupported_version`, `too_large`, `room_not_found`, `room_full`, `rate_limited`, `not_allowed`.

## Messages by channel

| Channel      | Types                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PhoneToRelay | `join`, `sensor_frames` {samples 1–32}, `gesture` {event}, `ping` {t}, `pong` {t}                                                                                                                  |
| RelayToPhone | `welcome`, `feedback` {feedback}, `ui` {ui}, `ping`, `pong`, `error`                                                                                                                               |
| HostToRelay  | `create_room` {maxPlayers? 1–8}, `resume_room` {roomCode, hostToken}, `feedback` {to, feedback}, `ui` {to, ui}, `ping`, `pong`                                                                     |
| RelayToHost  | `room_ready` {roomCode, hostToken, players}, `player_joined` {player}, `player_left` {playerId, reason}, `sensor_frames` {playerId, samples}, `gesture` {playerId, event}, `ping`, `pong`, `error` |

A `sensor_frames` batch holds 1 to 32 samples (`MAX_SAMPLES_PER_BATCH`, 1 s at 30 Hz). A worst-case sample is about 334 bytes of JSON, so 32 samples are about 10.7 KB. The first draft allowed 64, which can exceed 16 KB, so a batch could pass the schema and still fail `encode`.

`player_left.reason` is `left | timeout | kicked`. `hostToken` is 16–128 chars and is a secret: never log it.

Additions beyond the original message list, flagged for review: `create_room`, `resume_room` and `room_ready`. The relay needs them so a host can create a room and get it back after a disconnect (the 2-minute host grace period in the platform spec).

## Decoding

`channel.decode(raw: string): DecodeResult` runs these steps in order and stops at the first failure:

1. UTF-8 byte length > 16,384 → `too_large` (checked before `JSON.parse`).
2. `JSON.parse` fails, or the result is not a plain object → `bad_message`.
3. `v !== 1` → `unsupported_version`.
4. `type` not in this channel → `unknown_type`.
5. zod `safeParse` with that type's schema fails → `bad_message`, with zod's first issue as the message.

zod object schemas strip unknown keys by default, which implements "unknown fields are ignored". It also means a `playerId` sent by a phone in `sensor_frames` is dropped.

`DecodeResult` is `{ ok: true; message } | { ok: false; error: { code, message } }`. Decoding wraps everything in `try/catch`, so it never throws.

## Encoding

`channel.encode(message): string` validates with the same schema (catches bugs in our own code early), serializes with `JSON.stringify`, and throws `ProtocolError` if the result is over 16 KB.

## Room codes

Alphabet: `ABCDEFGHJKMNPQRSTUVWXYZ` (23 letters). `generateRoomCode(random?)` reads bytes from `crypto.getRandomValues` and uses rejection sampling: it accepts a byte only if it is below 253 (23 × 11), then takes `byte % 23`. That way every letter is equally likely. The `random` parameter lets tests pass fake byte sources.

`normalizeRoomCode(input)` uppercases, removes whitespace, and returns the code or `null` if it's invalid.

## Testing strategy

- fast-check arbitraries for every shared shape and every message type, in `src/testing/arbitraries.ts`. Numbers map `-0` to `0` because JSON can't represent `-0`.
- Round-trip property per channel over all its types.
- Room code properties with arbitrary byte sources, including mostly rejected bytes.
- Oversize property: a valid message padded with an extra field past 16 KB is always `too_large`.
- Robustness property: `decode` of arbitrary strings and arbitrary JSON never throws.
- Spoofing property: adding a `playerId` to phone `sensor_frames` or `gesture` never shows up in the decoded message.
- Compile-time check that the zod `Sample` type equals the frozen `Sample` type.
