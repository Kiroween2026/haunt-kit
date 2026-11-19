# Haunt Kit

Turn any phone into a motion, sound and touch controller for a web app. Scan a QR code, tap once, and your phone's tilt, shakes, mic loudness and taps reach the app. Nothing to install.

Built for the Kiroween 2026 hackathon (Skeleton Crew category).

## Two apps, one kit

- **[Séance Party](apps/seance-party)**: a Halloween party game for 1 to 8 players. Tilt together to steer a Ouija planchette, hold still so the ghost doesn't see you, scream louder than the banshee.
- **[Steady](apps/steady)**: a home physical-therapy rep counter. It counts reps out loud, measures range of motion and builds a report for your therapist. Your data stays on your phone.

## Quickstart

Requirements: Node 22 and pnpm (`corepack enable`).

```bash
git clone https://github.com/Kiroween2026/haunt-kit.git
cd haunt-kit
pnpm install
pnpm test
pnpm dev:seance   # Séance Party
pnpm dev:steady   # Steady
```

## Try it on your phone (local dev)

Motion sensors need HTTPS, so the phone goes through one `cloudflared` tunnel. The controller's dev server proxies `/relay` to the local relay, so one tunnel covers both.

```bash
pnpm dev:relay        # relay on ws://127.0.0.1:8787
pnpm dev:controller   # phone page on http://localhost:5180
pnpm dev:demo         # dot demo on http://localhost:5181
cloudflared tunnel --url http://localhost:5180
```

Open `http://localhost:5181/?play=https://<your-tunnel>.trycloudflare.com` on the laptop, scan the QR code with the phone, tap **Enter the séance** and tilt. No phone? Click **Add ghost player**.

## Use the kit in an app

```ts
import { createRoom, createMockRoom, createLocalSession } from "@haunt-kit/host-sdk";

const room = await createRoom({ relayUrl: "ws://127.0.0.1:8787", controllerUrl: "https://<tunnel>/" });
// or, with no relay and fake players:
// const room = await createMockRoom({ ghosts: [{ name: "Casper" }, { name: "Boo", recording: "shake" }] });

room.on("player_joined", (p) => room.setUi(p.playerId, { view: "tilt", title: "Steer the planchette" }));
room.on("frames", ({ playerId, samples }) => {
  /* samples: { t, ax, ay, az, gx, gy, gz, alpha, beta, gamma, rms? } */
});
room.on("gesture", ({ playerId, event }) => {
  /* event: { name, t, data? } */
});
```

## Scripts

| Script                              | What it does                |
| ----------------------------------- | --------------------------- |
| `pnpm test`                         | Run all tests               |
| `pnpm lint`                         | ESLint                      |
| `pnpm typecheck`                    | TypeScript in every package |
| `pnpm format` / `pnpm format:check` | Prettier                    |
| `pnpm build`                        | Build both apps             |

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the team works.

## License

[MIT](LICENSE)
