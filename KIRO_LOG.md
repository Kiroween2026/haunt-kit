# Kiro Log

Real events only. This becomes our "how we used Kiro" writeup.

Format: `YYYY-MM-DD | name | Kiro feature | what happened`
2026-11-16 | Yadnesh | Vibe chat | Kiro checked typescript-eslint's peer range (`typescript >=4.8.4 <6.1.0`) before installing and pinned TypeScript to ~6.0.3 instead of the latest 7.x, avoiding a broken lint setup. Reason recorded in .kiro/steering/tech.md.
2026-11-16 | Yadnesh | Property-based testing | The Sample JSON round-trip property needs -0 normalized to 0, because JSON.stringify(-0) is "0". Harmless for sensor data; documented in packages/protocol/src/index.test.ts.
2026-11-16 | Yadnesh | Steering | Wrote product.md, tech.md and structure.md so every teammate's Kiro gets the same rules (privacy, iPhone limits, folder owners) from day one.
2026-11-17 | Yadnesh | Specs | Wrote the protocol spec (requirements, design, tasks) before code. Writing the design showed the original message list had no way for a host to create or resume a room, so create_room, resume_room and room_ready were added and flagged for review.
2026-11-17 | Yadnesh | Property-based testing | The round-trip property passed with the first draft's 64-sample batch limit, because fast-check generates small arrays by default. A targeted worst-case check showed 64 samples of max-length numbers are about 21 KB, over the 16 KB limit, so a batch could pass the schema and still fail encode. Lowered the limit to 32 (about 10.7 KB) and added a property test that a full worst-case batch always fits.
2026-11-17 | Yadnesh | Property-based testing | Added a "no player spoofing" property: any playerId a phone puts on sensor_frames or gesture is dropped by decode, so the relay can only forward input under the sender's own id.
