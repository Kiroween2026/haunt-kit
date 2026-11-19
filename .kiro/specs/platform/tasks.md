# Tasks: platform

## Relay (Wed Nov 18)

- [x] 1. `Room` core: create/resume, join/rejoin, forwarding with sender id, feedback/ui routing, ping/pong (Req 1, 2)
- [x] 2. Rate limiting per socket (Req 1.10)
- [x] 3. Timers: 60 s player grace, 2 min host grace, `nextAlarm`/`alarm` (Req 2)
- [x] 4. Property tests: slot/color assignment, no crossed messages (Req 6.1, 6.2)
- [x] 5. `RelayHub` + in-memory transport
- [x] 6. Node relay (`ws`) with `/host`, `/join`, `/health`; integration test over real WebSockets (Req 3.2, 6.3)
- [x] 7. Cloudflare Worker + `RoomObject` Durable Object with hibernation and storage; `wrangler.toml` (Req 3.1)

## Host SDK (Fri Nov 20)

- [x] 8. `Transport`, URLs, backoff, event emitter
- [x] 9. `HostSession` / `createRoom` with QR, events, `sendFeedback`, `setUi`, latency (Req 5.1, 5.2)
- [x] 10. Host auto-resume (Req 5.3)
- [x] 11. Ghost Recording placeholder, synthetic recordings, `GhostPlayer`
- [x] 12. MockTransport: `createMockRelay`, `createMockRoom` (Req 5.5)
- [x] 13. Device modules: normalize, RMS, batcher, OS detection, permissions, sampler, mic meter, wake lock (Req 4.2–4.5)
- [x] 14. Local mode `createLocalSession` (Req 5.4)

## Controller (Thu Nov 19)

- [x] 15. `PhoneClient`: join, store playerId, reconnect with backoff, ping/latency (Req 4.7)
- [x] 16. Screens: join form, enter tap, views, feedback, error screens (Req 4.1, 4.6, 4.8)
- [x] 17. 30 Hz sampling + batches (Req 4.5)

## Reconnect + demo (Sat Nov 21)

- [x] 18. Wake lock re-acquire on visibility change; rejoin after screen lock
- [x] 19. Dot demo: tilt a real iPhone, a dot moves on the laptop (built and checked with ghost players; real iPhone test still to do)
- [x] 20. Vite proxy + cloudflared instructions (Req 3.3)
