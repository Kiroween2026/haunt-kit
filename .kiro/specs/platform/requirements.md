# Requirements: platform

Owner: Yadnesh. Packages: `packages/relay`, `packages/controller`, `packages/host-sdk`. Every message uses `@haunt-kit/protocol`.

## Requirement 1: Relay rooms

**User story:** As a host app, I want to create a room and get a short code, so that players can join it.

1. WHEN a host connects to `/host` and sends `create_room` THEN the relay SHALL reply `room_ready` with a new room code, a secret `hostToken` and the player list.
2. A room SHALL hold at most `maxPlayers` players (default and maximum 8) and one host.
3. WHEN a phone connects to `/join?room=CODE` and sends `join` THEN the relay SHALL reply `welcome` with a new `playerId` and a color, and send `player_joined` to the host.
4. WHEN the room does not exist or has closed THEN `join` SHALL get `error room_not_found` and the socket SHALL close.
5. WHEN the room is full THEN `join` SHALL get `error room_full` and the socket SHALL close.
6. The relay SHALL validate every message with the protocol channels and reply `error` with the decode error code on invalid input.
7. The relay SHALL forward a phone's `sensor_frames` and `gesture` to the host stamped with that phone's own `playerId`. Player A's input SHALL never reach the host as player B's.
8. The relay SHALL forward the host's `feedback` and `ui` to one player or to all connected players.
9. The relay SHALL answer `ping` with `pong` carrying the same `t`.
10. Each connection SHALL be limited to 60 messages per second. Extra messages are dropped and the sender gets at most one `error rate_limited` per second.

## Requirement 2: Reconnects

**User story:** As a player whose iPhone locked its screen, I want to come back as the same player, so that I keep my place and color.

1. WHEN a phone's socket closes THEN its slot SHALL be kept for 60 seconds.
2. WHEN a phone sends `join` with a known `playerId` within those 60 seconds THEN it SHALL get the same `playerId`, slot and color, and the host SHALL NOT get a new `player_joined`.
3. WHEN 60 seconds pass without a rejoin THEN the slot SHALL be freed and the host SHALL get `player_left` with reason `timeout`.
4. WHEN a second socket rejoins with a `playerId` that is still connected THEN the old socket SHALL be closed and replaced.
5. WHEN the host disconnects THEN the room SHALL stay open for 2 minutes. A host that sends `resume_room` with the right code and token SHALL get the room back with the current players.
6. WHEN 2 minutes pass without the host THEN every phone SHALL get `error room_not_found` and be disconnected, and the room SHALL close.
7. A wrong `hostToken` SHALL get `error not_allowed`. The token SHALL be compared in constant time and never logged.

## Requirement 3: Hosting

1. The relay SHALL run on Cloudflare Workers with one Durable Object per room, using the WebSocket hibernation API, with room state saved in Durable Object storage so it survives hibernation.
2. The same room logic SHALL run in a Node relay (`ws`) for local development, tests, the Séance MCP server and as the Fly.io fallback.
3. Local development SHALL work on an iPhone over HTTPS through one `cloudflared` tunnel.

## Requirement 4: Phone controller

**User story:** As a player, I want to scan a QR code, tap once and play, with nothing to install.

1. The controller SHALL read the room code from `?room=ABCD` or let the player type it.
2. One "Enter the séance" tap SHALL request motion permission (iOS), microphone permission and a Screen Wake Lock.
3. Mic loudness SHALL be computed on the phone as an RMS value in 0..1 with an `AnalyserNode`. Audio SHALL never be sent.
4. One function SHALL normalize iOS and Android axis differences, with tests.
5. The controller SHALL sample at 30 Hz and send `sensor_frames` in batches every 100 ms.
6. The controller SHALL show the view the host asks for (`ui`) and play `feedback` (flash, color, sound).
7. The controller SHALL reconnect with backoff, keep its `playerId` in `localStorage`, and show latency.
8. The controller SHALL show clear screens for: permission denied, room not found, room full, disconnected.

## Requirement 5: Host SDK

**User story:** As an app developer, I want a few lines of code to get phone input, so that I can focus on my game.

1. `createRoom({ relayUrl, controllerUrl })` SHALL resolve to a room with `code`, `joinUrl`, `qrSvg`, `players`, `on(event, handler)`, `sendFeedback(target, feedback)`, `setUi(target, ui)` and `close()`.
2. Events: `player_joined`, `player_left`, `gesture`, `frames`, `status`, `error`.
3. WHEN the host connection drops THEN the SDK SHALL reconnect with `resume_room` for up to 2 minutes, then report status `closed`.
4. A local mode SHALL read sensors in the same page (for Steady) with the same events and no relay.
5. A MockTransport SHALL let apps run with no relay, with fake players replaying Ghost Recordings (placeholder format until Anish's `@haunt-kit/gestures` format is merged).

## Requirement 6: Tests

1. Property test: reconnect slot assignment (connected players never share a slot or color; a rejoin within 60 s keeps slot and color).
2. Property test: messages never cross players.
3. Integration tests with a real Node relay over WebSockets, and with the in-memory relay.
