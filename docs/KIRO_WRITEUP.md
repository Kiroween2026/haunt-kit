# How we used Kiro

Haunt Kit was built by three people in 19 days. This page is written from [KIRO_LOG.md](../KIRO_LOG.md), where we wrote down real events as they happened.

**Who wrote what.** Each section says who did the work. For about a week Viviana and Anish were not able to work on the project, so Yadnesh built parts of their areas (the design system, Séance Party, Steady, and most gesture detectors, hooks and agents) and said so in each commit and pull request. Those sections are written by Yadnesh, describing what happened. Viviana and Anish: add your own experience under your name wherever you worked with Kiro yourself.

## Spec-driven development

_Yadnesh:_ Every component has a spec in `.kiro/specs/` written before the code: requirements, design, then tasks ticked off one by one. The specs are `protocol`, `platform`, `seance-mcp`, `seance-party` and `steady`. Writing the protocol design first showed a gap in our plan: the message list had no way for a host to create a room or get it back after a disconnect. We added `create_room`, `resume_room` and `room_ready` before any code depended on the old list.

_Anish:_ wrote the `gestures` spec (`.kiro/specs/gestures/`: requirements, design and tasks), the Ghost Recording schema and the first detectors (tilt, shake, hold-still). His commits are in the git history.

_Yadnesh, for Séance Party and Steady:_ the specs describe the game and the app in plain requirements, and the game rules were built as pure functions behind a thin React layer. That is what let the property tests attack the rules directly.

## Steering

_Yadnesh:_ On day one we wrote `product.md`, `tech.md` and `structure.md`, so all three of our Kiro sessions started with the same rules: raw audio never leaves the phone, the iPhone limits (HTTPS, one-tap permissions, no vibration), who owns which folder, and why TypeScript is pinned to 6. Later each shared part got its own steering file: `protocol.md` tells every teammate's Kiro to use the channel `encode`/`decode` and never trust a `playerId` from a phone, and `mcp-usage.md` says when to use each Séance MCP tool and never to change a detector threshold without data. `design.md` holds the visual and accessibility rules for both apps, and the design hook checks the mechanical ones.

_Anish:_ wrote `gestures.md`: units, the rule that detectors are pure with no browser APIs, and "never change a threshold without testing against the recordings".

## Property-based testing

_Yadnesh:_ fast-check found or prevented real bugs:

- **Batch size overflow.** The first protocol draft allowed 64 samples per batch. The round-trip property passed, because fast-check makes short arrays by default. A worst-case check showed 64 long numbers are about 21 KB, over our 16 KB message limit: a batch could pass the schema and still fail to send. We lowered the limit to 32 and added a property that a full worst-case batch always fits.
- **`__proto__` in gesture data.** The round-trip property failed in CI with a new random seed: `{"__proto__": 0}` decoded as `{}`, because zod drops that key. The host would have received a different message than the phone sent. Keys like that are now rejected.
- **No player spoofing.** A property checks that any `playerId` a phone adds to its input is dropped, and another runs random joins, drops, rejoins and waits against a room and checks every frame reaches the host under its sender's id.
- **Testing the tests.** We planted bugs on purpose and checked the properties failed. That showed the generator rarely waited around the 60-second rejoin limit, and that a "a leaver never wins" property over whole games passed even with the bug in, because a leaver rarely leads. A direct property over random scores and leavers failed correctly.
- **Detectors.** Properties cover the five invariants in the gestures spec: a still phone never fires shake, flick or spin; shake gives the same result however the phone is rotated; real gestures are detected at any sample rate from 30 to 120 Hz; events fall inside the input's time range; and N synthetic reps count as exactly N. Bugs found while building: the rep detector crashed on its first sample (a unit vector can have a norm of 0.99999999 and a free-fall guard rejected it), and a flick made during the cooldown was reported late, when the cooldown ended.
- **Séance Party.** Averaged tilt always stays on the board, scores are never negative, a player who left never wins, and a game with only bots always finishes with a winner for any seed. They found that a perfectly aimed bot could never spell BOO or SPOOK, because a letter can't be picked twice until the planchette leaves it.
- **Design system.** Every text color pair reaches 4.5:1 in all three themes (and 7:1 in the high-contrast one), checked by a property test and then by axe in real browsers.
- **Steady.** A summary always agrees with its reps, and history never loses a saved session, even after the database is closed and reopened.
- **A bug the tests only found against real data.** Anish's real Android recordings showed our synthetic gravity had the x and y signs backwards (error 8 to 19 m/s² on tilted recordings, under 0.6 once fixed). Every earlier test passed because they were written with the same wrong formula. A test now checks the model against every file in `recordings/`.

_Anish:_ his property tests are in `packages/gestures/src/pbt/` on his branch.

## MCP

_Yadnesh:_ The **Séance MCP** (`packages/mcp-server`) connects Kiro to real phones while developing. Kiro can list the phones in a room, take a sensor snapshot (min, max, mean and variance per axis), record a motion into `recordings/`, replay a recording as a fake player, and fire a gesture. We tested it through a real MCP client against a real relay with a ghost phone doing a ±30° tilt circle: the snapshot reported beta within ±30° and a mean acceleration of 9.81, which matches the motion. It only works against the local dev relay, behind a token that's never logged.

The `gesture-tuner` agent is set up to use these tools. It has not yet been run on a real misfire, because that needs a person with a phone and a detector that is wrong.

## Hooks

_Yadnesh, built for Anish and Viviana:_ Kiro's current hooks (`.kiro/hooks/*.json`) fire when Kiro itself saves a file, and a command hook receives the event as JSON on STDIN. So each hook runs a small tested script.

- **Gesture from spec.** When Kiro saves a `*.gesture.md`, a script checks the spec has all seven sections and prints an exact work order: write the detector, a property test for every "Must NOT fire when" line, register it, run the tests, log it. An incomplete spec gets "do not write a detector yet". The proof run was `double-shake.gesture.md`, which produced a detector and 11 tests, 5 of them property tests. Planting bugs (no calm-pause rule, no time window) was caught by those tests. A second hook runs the gesture tests whenever Kiro saves a file in the package.
- **Design check on save.** When Kiro saves a `.tsx` or `.css` file in the apps or the UI package, a script reports hard-coded colors, removed focus outlines, small text and tap targets, missing alt text, missing reduced-motion fallbacks, raw buttons and shouty wording, with file and line. Its first run flagged four real problems in the design system's own `PlayerGhost`.
- **Not verified:** the IDE firing these hooks itself. The hook files were created in the same session that used them, so we ran each hook's command by hand and tested the script.

## Custom agents

_Yadnesh, built for Anish and Viviana:_ Kiro's current agent format is a Markdown file with YAML front matter.

- **gesture-tuner** (`.kiro/agents/gesture-tuner.md`): uses the Séance tools, may only write under `packages/gestures`, `recordings` and `KIRO_LOG.md`, may only run test commands, and must show before and after numbers for every recording before it changes a threshold.
- **spook-designer** (`.kiro/agents/spook-designer.md`): reviews UI against `design.md` and reports problems with file and line. It runs `pnpm design-check` first, can't edit files, and says which checks it ran.

## CI and testing

_Yadnesh:_ CI runs lint, format check, typecheck, unit and property tests, the build, and Playwright end-to-end tests on WebKit (Safari's engine, since our team only has iPhones) and Chromium. Things Kiro caught along the way:

- CI's `pnpm install --frozen-lockfile` failed because pnpm 12 blocks install scripts, and wrangler needs esbuild and workerd. We allowed just those two.
- The same 7-step smoke test runs against the Node relay and against the Cloudflare Durable Object in `wrangler dev`, so both relays behave the same.
- Two controller tests timed out. The bug was in our in-memory test relay: it dropped a message sent right before closing, which a real WebSocket delivers. The mock now matches the real thing.
- In Playwright, Chromium now has `DeviceMotionEvent.requestPermission` too and refuses motion unless the test grants it. The controller showed "Motion is blocked", which is the correct screen.
- The end-to-end job once hung for 15 minutes after all tests passed, because the dev servers were started through `pnpm` and didn't exit. They now run as plain `node` processes, and every job has a time limit.
- A "no motion sensors" test found a real bug: desktop Chrome fires one motion event with every value null, so Steady believed a laptop had sensors and waited forever. The sampler now ignores empty events.
- axe runs on every screen of both apps (WCAG 2 A and AA, including rendered color contrast) and found no violations.

## Kiro IDE vs CLI vs Web

_Yadnesh:_ All of this work used Kiro in the IDE, in chat. Kiro ran commands in the terminal (tests, `wrangler dev`, Playwright, `gh` for pull requests), read the failures and fixed them. We did not use Kiro CLI or Kiro Web for this project. If you did, add it here.
