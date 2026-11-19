# Séance MCP: when to use each tool

The `seance` MCP server (`packages/mcp-server`, registered in `.kiro/settings/mcp.json`) connects Kiro to real phones through the local Node relay. It only works in development.

## Setup (once per computer)

1. `pnpm dev:token` writes a random `HAUNT_DEV_TOKEN` to `.env.local` (git-ignored). Never paste the token into chat, code or commits.
2. `pnpm dev:relay`. The log must say `admin API for the Séance MCP: on`.
3. Restart the `seance` server in Kiro's MCP panel.
4. Open a host app (e.g. `pnpm dev:demo`) and join with a phone.

## Tools

| Tool                                 | Use it when                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_rooms`                         | First step: find the room code.                                                                                                                                    |
| `list_devices`                       | Find a phone's `playerId`, its OS and its real sample rate.                                                                                                        |
| `get_sensor_snapshot`                | **Before changing any detector threshold.** Read min/max/mean/variance per axis while the person holds still, then while they do the motion.                       |
| `start_recording` / `stop_recording` | Capture a motion as a Ghost Recording in `recordings/`. Name it `<gesture>-<variant>`, e.g. `shake-gentle`. Ask the person to do the motion between the two calls. |
| `replay_recording`                   | Test a detector or a game against a recording without anyone moving a phone. Use `speed` to run faster, `loop` for long tests.                                     |
| `stop_replay`                        | End a replayed ghost.                                                                                                                                              |
| `fire_gesture`                       | Check how a game reacts to a gesture (e.g. `shake`), independent of detection.                                                                                     |

## Rules

- Never change a detector threshold without a snapshot or a replayed recording that shows the before and after.
- Raw samples only arrive while the phone is in a `tilt` or `scream` view, or when the controller is opened with `?raw=1`. If a snapshot is empty, say so and ask the person to reopen the controller with `?raw=1`.
- Every new recording should also get a test in `packages/gestures` (Anish owns that folder).
- The admin API does not exist on the Cloudflare relay or when `NODE_ENV=production`. Don't try to use these tools against staging or production.
