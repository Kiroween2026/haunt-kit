# Design: platform

## Overview

```
 phone (controller) ──ws /join?room=ABCD──┐
 phone (controller) ──ws /join?room=ABCD──┤      ┌──────────── Room core ────────────┐
                                          ├────▶ │ state: code, hostToken, players,  │
 host app (host-sdk) ──ws /host──────────┘      │ hostGoneAt; rate limits; timers   │
                                                 └───────────────────────────────────┘
          Cloudflare: Worker → Durable Object "RoomObject" (one per code)
          Node:       RelayHub (all rooms in one process) + http admin API (dev only)
          Tests/mock: RelayHub + in-memory transport
```

The room logic is one transport-free class, `Room` (`packages/relay/src/core/room.ts`). It never touches a real socket. It gets a list of `RoomSocket`s (`send`, `close`, `meta`, `key`) and a clock. Three hosts drive it:

| Host             | File                       | Used for                                                  |
| ---------------- | -------------------------- | --------------------------------------------------------- |
| Durable Object   | `relay/src/worker.ts`      | staging and production                                    |
| Node `ws` server | `relay/src/node/server.ts` | local dev, Séance MCP, integration tests, Fly.io fallback |
| In-memory hub    | `relay/src/core/memory.ts` | host-sdk MockTransport, unit tests                        |

## Room state

```ts
type RoomState = {
  code; created; hostToken; maxPlayers;
  players: (PlayerInfo & { slot; connected; disconnectedAt })[];
  hostGoneAt; closed;
};
type SocketMeta = { role: "host"; authed } | { role: "player"; playerId | null; retired? };
```

- `RoomState` is plain JSON. The Durable Object saves it to storage after each change, so it survives hibernation.
- `SocketMeta` lives on the socket (`serializeAttachment` in the Durable Object), so after hibernation the room still knows which socket is the host and which is which player.
- When a socket is replaced (rejoin or host resume), the old socket is marked `retired` / `authed: false` before it is closed, so its late `close` event doesn't mark the new connection as gone.

## Timers

`room.nextAlarm()` returns the earliest deadline: `disconnectedAt + 60 s` for each disconnected player and `hostGoneAt + 120 s`. The Durable Object sets a storage alarm for it. The Node hub uses `setTimeout`. `room.alarm()` frees expired slots (`player_left timeout`) and closes the room if the host is gone.

## Rate limiting

A token bucket per socket: capacity 60, refill 60 per second. The phone sends 10 batches + 0.5 pings per second, well under the limit.

## Room codes in the Worker

`/host` with no code: the Worker generates a code and forwards to `idFromName(code)` with `new=1`. If that Durable Object already has a live room it answers 409 and the Worker tries another code (up to 8 times). `/host?room=ABCD` resumes. `/join?room=ABCD` joins.

## Controller

Vanilla TypeScript + Vite (small and fast to load on a phone). Logic is split into pure, tested modules:

| Module                             | Job                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `host-sdk/src/device/normalize.ts` | one function for iOS/Android axis differences                                |
| `host-sdk/src/device/rms.ts`       | RMS of an audio buffer, 0..1                                                 |
| `host-sdk/src/device/batcher.ts`   | 30 Hz samples into ≤32-sample batches every 100 ms                           |
| `host-sdk/src/backoff.ts`          | reconnect delays                                                             |
| `controller/src/client.ts`         | `PhoneClient`: join, rejoin, reconnect, ping/latency, ui and feedback events |
| `controller/src/main.ts`           | DOM screens only                                                             |

Browser-only parts (permissions, `MotionSampler`, `MicMeter`, wake lock) live in `host-sdk/src/device/` because Steady's local mode needs the same code.

The permission tap starts `DeviceMotionEvent.requestPermission()`, `DeviceOrientationEvent.requestPermission()` and `getUserMedia()` before any `await`, so iOS still sees them as part of the tap.

## Host SDK

- `HostSession` implements `HauntRoom` over a `Transport` (`send`, `close`, `onopen`, `onmessage`, `onclose`). The default transport is the browser `WebSocket`.
- MockTransport: `createMockRelay()` runs the real `Room` core in memory, so mock behavior matches the real relay. `addGhost()` joins a fake phone that replays a `GhostRecording`.
- Local mode: `createLocalSession()` samples sensors in-page and emits the same `frames` events for one player.
- `GhostRecording` is a placeholder in `host-sdk/src/ghost.ts` (`{ meta: { label, os, browser, sampleRateHz, recordedAt }, samples }`). TODO: switch to Anish's schema in `@haunt-kit/gestures` when it's merged.

## Local dev on an iPhone

`pnpm dev:relay` (Node relay on :8787) and `pnpm dev:controller` (Vite on :5180, proxies `/relay` to :8787 including WebSockets). One tunnel, `cloudflared tunnel --url http://localhost:5180`, gives the phone HTTPS for both the page and the relay.

## Testing

- Property tests on `Room` with random operation sequences (join, drop, rejoin, frames, time passing): slots and colors unique among players, rejoin keeps slot and color, every forwarded frame carries its sender's id.
- In-memory integration: `HostSession` + `PhoneClient` + `RelayHub`.
- Node integration: real WebSockets against `startNodeRelay()`.
