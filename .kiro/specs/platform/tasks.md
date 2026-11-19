# Tasks: platform

## Relay (Wed Nov 18)

- [ ] 1. `Room` core: create/resume, join/rejoin, forwarding with sender id, feedback/ui routing, ping/pong (Req 1, 2)
- [ ] 2. Rate limiting per socket (Req 1.10)
- [ ] 3. Timers: 60 s player grace, 2 min host grace, `nextAlarm`/`alarm` (Req 2)
- [ ] 4. Property tests: slot/color assignment, no crossed messages (Req 6.1, 6.2)
- [ ] 5. `RelayHub` + in-memory transport
- [ ] 6. Node relay (`ws`) with `/host`, `/join`, `/health`; integration test over real WebSockets (Req 3.2, 6.3)
- [ ] 7. Cloudflare Worker + `RoomObject` Durable Object with hibernation and storage; `wrangler.toml` (Req 3.1)

## Host SDK (Fri Nov 20)

- [ ] 8. `Transport`, URLs, backoff, event emitter
- [ ] 9. `HostSession` / `createRoom` with QR, events, `sendFeedback`, `setUi`, latency (Req 5.1, 5.2)
- [ ] 10. Host auto-resume (Req 5.3)
- [ ] 11. Ghost Recording placeholder, synthetic recordings, `GhostPlayer`
- [ ] 12. MockTransport: `createMockRelay`, `createMockRoom` (Req 5.5)
- [ ] 13. Device modules: normalize, RMS, batcher, OS detection, permissions, sampler, mic meter, wake lock (Req 4.2–4.5)
- [ ] 14. Local mode `createLocalSession` (Req 5.4)

## Controller (Thu Nov 19)

- [ ] 15. `PhoneClient`: join, store playerId, reconnect with backoff, ping/latency (Req 4.7)
- [ ] 16. Screens: join form, enter tap, views, feedback, error screens (Req 4.1, 4.6, 4.8)
- [ ] 17. 30 Hz sampling + batches (Req 4.5)

## Reconnect + demo (Sat Nov 21)

- [ ] 18. Wake lock re-acquire on visibility change; rejoin after screen lock
- [ ] 19. Dot demo: tilt a real iPhone, a dot moves on the laptop
- [ ] 20. Vite proxy + cloudflared instructions (Req 3.3)
