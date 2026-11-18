# Tasks: protocol

- [x] 1. Add zod to `packages/protocol`
- [x] 2. Shared schemas: Sample (with compile-time match to the frozen type), GestureEvent, PlayerId, Color, Device, PlayerInfo, Feedback, UiView, Target, error codes
  - Requirements: 5.2, 5.3
- [x] 3. Message schemas for the four channels: PhoneToRelay, RelayToPhone, HostToRelay, RelayToHost
  - Requirements: 2.1–2.5
- [x] 4. Codec: `createChannel`, `decode` (size → JSON → version → type → schema), `encode` (validate, size check), `ProtocolError`
  - Requirements: 1.1–1.6, 4.1–4.3, 5.1
- [x] 5. Room codes: `generateRoomCode` with rejection sampling, `isRoomCode`, `normalizeRoomCode`
  - Requirements: 3.1–3.3
- [x] 6. fast-check arbitraries for every message type
- [x] 7. Property tests: round-trip for every type, room codes, oversize, decode never throws, unknown fields ignored, no player spoofing
  - Requirements: 6.1–6.5
- [x] 8. Unit tests: version mismatch, unknown type, bad JSON, non-object JSON
- [x] 9. Write `.kiro/steering/protocol.md`
- [ ] 10. Viviana and Anish approve the PR (freeze)
