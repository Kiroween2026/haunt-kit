# How we used Kiro

Haunt Kit was built by three people in 19 days. This page is written from [KIRO_LOG.md](../KIRO_LOG.md), where we wrote down real events as they happened. Each person writes their own sections.

## Spec-driven development

_Yadnesh:_ Each of my components has a spec in `.kiro/specs/` (`protocol`, `platform`, `seance-mcp`) written before the code: requirements, design, then tasks I ticked off one by one. Writing the protocol design first showed a gap in our plan: the message list had no way for a host to create a room or get it back after a disconnect. We added `create_room`, `resume_room` and `room_ready` before any code depended on the old list.

_Anish:_ TODO (gestures and Steady specs).

_Viviana:_ TODO (design system and Séance Party specs).

## Steering

_Yadnesh:_ On day one we wrote `product.md`, `tech.md` and `structure.md`, so all three of our Kiro sessions started with the same rules: raw audio never leaves the phone, the iPhone limits (HTTPS, one-tap permissions, no vibration), who owns which folder, and why TypeScript is pinned to 6. Later each shared part got its own steering file: `protocol.md` tells every teammate's Kiro to use the channel `encode`/`decode` and never trust a `playerId` from a phone, and `mcp-usage.md` says when to use each Séance MCP tool and to never change a detector threshold without data.

_Viviana:_ TODO (`design.md`).

## Property-based testing

_Yadnesh:_ fast-check found or prevented real bugs in my packages:

- **Batch size overflow.** The first protocol draft allowed 64 samples per batch. The round-trip property passed, because fast-check makes short arrays by default. A worst-case check showed 64 long numbers are about 21 KB, over our 16 KB message limit: a batch could pass the schema and still fail to send. We lowered the limit to 32 and added a property that a full worst-case batch always fits.
- **`__proto__` in gesture data.** The round-trip property failed in CI with a new random seed: `{"__proto__": 0}` decoded as `{}`, because zod drops that key. The host would have received a different message than the phone sent. Keys like that are now rejected.
- **No player spoofing.** A property checks that any `playerId` a phone adds to its input is dropped, and another runs random joins, drops, rejoins and waits against a room and checks every frame reaches the host under its sender's id.
- **Testing the tests.** We planted two bugs on purpose (color by player count instead of slot; frames stamped with the wrong player). Both were caught, and doing it showed the generator rarely waited around the 60-second rejoin limit. We fixed the generator.
- **Simulator.** For any mouse position, gravity is exactly 9.81, and an untouched simulator is perfectly still, so it can't trigger a shake by itself.

_Anish:_ TODO (detector properties and the bugs they caught).

## MCP

_Yadnesh:_ The **Séance MCP** (`packages/mcp-server`) connects Kiro to real phones while developing. Kiro can list the phones in a room, take a sensor snapshot (min, max, mean and variance per axis), record a motion into `recordings/`, replay a recording as a fake player, and fire a gesture. We tested it through a real MCP client against a real relay with a ghost phone doing a ±30° tilt circle: the snapshot reported beta within ±30° and a mean acceleration of 9.81, which matches the motion. It only works against the local dev relay, behind a token that's never logged.

_Anish:_ TODO (how the gesture-tuner agent uses it).

## Hooks

_Yadnesh:_ I didn't create hooks for my packages.

_Anish:_ TODO (gesture-from-spec hook).

_Viviana:_ TODO (accessibility hook).

## Custom agents

_Anish:_ TODO (gesture-tuner).

_Viviana:_ TODO (spook-designer).

## CI and testing

_Yadnesh:_ CI runs lint, format check, typecheck, unit and property tests, the build, and Playwright end-to-end tests on WebKit (Safari's engine, since our team only has iPhones) and Chromium. Things Kiro caught along the way:

- CI's `pnpm install --frozen-lockfile` failed because pnpm 12 blocks install scripts, and wrangler needs esbuild and workerd. We allowed just those two.
- The same 7-step smoke test runs against the Node relay and against the Cloudflare Durable Object in `wrangler dev`, so both relays behave the same.
- Two controller tests timed out. The bug was in our in-memory test relay: it dropped a message sent right before closing, which a real WebSocket delivers. The mock now matches the real thing.
- In Playwright, Chromium now has `DeviceMotionEvent.requestPermission` too and refuses motion unless the test grants it. The controller showed "Motion is blocked", which is the correct screen.

## Kiro IDE vs CLI vs Web

_Yadnesh:_ All my work used Kiro in the IDE, in chat. Kiro ran commands in the terminal (tests, `wrangler dev`, Playwright, `gh` for pull requests), read the failures and fixed them. TODO: add anything we did with the CLI or Web before submitting.
