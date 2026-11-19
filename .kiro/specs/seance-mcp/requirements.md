# Requirements: seance-mcp

Owner: Yadnesh. Package: `packages/mcp-server`.

**User story:** As a developer tuning a gesture, I want Kiro to see what my phone's sensors are doing and to replay recorded motions, so that thresholds are based on real data instead of guesses.

1. The server SHALL use the official MCP TypeScript SDK over stdio and be registered in `.kiro/settings/mcp.json`.
2. Tools: `list_rooms()`, `list_devices(roomCode)`, `get_sensor_snapshot(roomCode, playerId, seconds)`, `start_recording(roomCode, playerId, label)`, `stop_recording(id)`, `replay_recording(roomCode, file, playerName, speed, loop)`, `stop_replay(id)`, `fire_gesture(roomCode, playerId, name, data?)`.
3. `get_sensor_snapshot` SHALL return min, max, mean and variance per axis, plus acceleration magnitude, and at most 30 evenly spaced samples.
4. `stop_recording` SHALL save a Ghost Recording (`{ meta, samples }`) in `recordings/`, starting at t = 0, and validate it before writing.
5. `replay_recording` SHALL join the room as a player over the real protocol, so the app can't tell it from a phone.
6. Security: the server SHALL reach the relay only through a dev admin API protected by `HAUNT_DEV_TOKEN`. The relay SHALL refuse admin requests without the right token (401), and SHALL not offer the admin API in production or on Cloudflare (404). The token SHALL never be logged, returned or put in error messages, and SHALL not be stored in `mcp.json`.
7. File arguments SHALL never reach outside `recordings/`.
8. Errors SHALL explain what to do next (start the relay, run `pnpm dev:token`, use `?raw=1`).
