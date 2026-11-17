# Kiro Log

Real events only. This becomes our "how we used Kiro" writeup.

Format: `YYYY-MM-DD | name | Kiro feature | what happened`
2026-11-16 | Yadnesh | Vibe chat | Kiro checked typescript-eslint's peer range (`typescript >=4.8.4 <6.1.0`) before installing and pinned TypeScript to ~6.0.3 instead of the latest 7.x, avoiding a broken lint setup. Reason recorded in .kiro/steering/tech.md.
2026-11-16 | Yadnesh | Property-based testing | The Sample JSON round-trip property needs -0 normalized to 0, because JSON.stringify(-0) is "0". Harmless for sensor data; documented in packages/protocol/src/index.test.ts.
2026-11-16 | Yadnesh | Steering | Wrote product.md, tech.md and structure.md so every teammate's Kiro gets the same rules (privacy, iPhone limits, folder owners) from day one.
2026-11-17 | Anish | Spec mode | Authored gestures spec, Ghost Recording schema, and gestures.md steering, freezing the detector contract for host-sdk and seance-party unblocking.
