# Design: seance-mcp

```
Kiro ──stdio── seance MCP (packages/mcp-server)
                 ├── HTTP + Bearer token ──▶ Node dev relay /admin/*   (list, devices, samples, gesture)
                 └── WebSocket /join ──────▶ Node dev relay            (replayed ghost players)
```

- The Node relay keeps the last 1,800 samples (60 s at 30 Hz) per player, only when the admin API is on.
- Admin routes: `GET /admin/rooms`, `GET /admin/rooms/:code/devices`, `GET /admin/rooms/:code/players/:id/samples?seconds|sinceT`, `POST /admin/rooms/:code/players/:id/gesture`. The token is compared in constant time.
- Recording works by remembering the player's last sample time at start, then reading everything after it at stop. No streaming connection is needed.
- Replays reuse `GhostPlayer` from the host-sdk.
- The token comes from `HAUNT_DEV_TOKEN` or the git-ignored `.env.local` (`pnpm dev:token`).

Tests run the tools through a real MCP client (in-memory transport) against a real Node relay with a ghost phone streaming a known motion.
