# Protocol (packages/protocol)

Every message between the phone controller, the relay and the host app is defined in `@haunt-kit/protocol`. Never hand-write message JSON or parse it with `JSON.parse` directly. Use a channel's `encode` and `decode`.

## Change rule

`packages/protocol` is a frozen contract since Tue Nov 17. Any change needs Yadnesh, Viviana and Anish to approve the PR. That includes the `Sample`, `GestureEvent` and `Detector` types.

## Channels

| Channel        | Who decodes it | Types                                                                                             |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `phoneToRelay` | relay          | `join`, `sensor_frames`, `gesture`, `ping`, `pong`                                                |
| `relayToPhone` | controller     | `welcome`, `feedback`, `ui`, `ping`, `pong`, `error`                                              |
| `hostToRelay`  | relay          | `create_room`, `resume_room`, `feedback`, `ui`, `ping`, `pong`                                    |
| `relayToHost`  | host-sdk       | `room_ready`, `player_joined`, `player_left`, `sensor_frames`, `gesture`, `ping`, `pong`, `error` |

Every message has `v: 1` and `type`.

## Usage

```ts
import { phoneToRelay, relayToHost } from "@haunt-kit/protocol";

const result = phoneToRelay.decode(raw); // never throws
if (!result.ok) return send(error(result.error.code, result.error.message));
if (result.message.type === "gesture") {
  const text = relayToHost.encode({ v: 1, type: "gesture", playerId, event: result.message.event });
}
```

## Rules

- `decode` checks in this order: size (16 KB), JSON, `v`, `type`, schema. It returns `{ ok, message }` or `{ ok: false, error: { code, message } }`.
- `encode` throws `ProtocolError` on an invalid or oversized message. That's a bug in our code, not user input.
- Unknown fields are dropped. Unknown types fail with `unknown_type`.
- Phones never send a `playerId` on `sensor_frames` or `gesture`. The relay stamps the sender's own id on what it forwards to the host. Never trust an id that came from a phone's input.
- A `sensor_frames` batch holds 1 to 32 samples (`MAX_SAMPLES_PER_BATCH`). At 30 Hz, send a batch at least once a second.
- Room codes: 4 letters from `ABCDEFGHJKMNPQRSTUVWXYZ`. Create them with `generateRoomCode()`. Clean typed input with `normalizeRoomCode()`.
- `hostToken` is a secret. Never log it.
- Control views for the `ui` message: `tilt`, `still`, `scream`, `tap`, `wait`.

Spec: `.kiro/specs/protocol/`.
