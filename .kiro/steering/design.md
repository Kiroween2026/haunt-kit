# Design rules

Applies to every UI change in `apps/*` and `packages/ui`. The "Design check on save" hook and
`pnpm design-check` check the rules marked ✔. The `spook-designer` agent reviews the rest.

## Look

- Two themes, one family. **haunted** (Séance Party): dark, candlelight glow, floating ghosts, playful and spooky, never gory.
  **lantern** (Steady): warm, calm, very readable. Same shapes, spacing and motion.
- Wrap the app in `<ThemeProvider theme="haunted">` or `theme="lantern"` and import `@haunt-kit/ui/styles.css` once.
- Fonts are self-hosted and licensed under the SIL Open Font License: Cinzel and Nunito (haunted), Atkinson Hyperlegible (lantern).
- Build screens from `@haunt-kit/ui`: `Button`, `Card`, `Modal`, `PlayerGhost`, `QRPanel`, `Scoreboard`, `Countdown`, `ToastRegion`. ✔ (raw `<button>`, `alert()`)

## Tokens

- ✔ No hard-coded colors outside `packages/ui/src/tokens.ts`. Use `var(--hk-color-…)`. Spacing, radius, type and motion also come from `--hk-…` variables.
- Tokens live in `packages/ui/src/tokens.ts`. After changing them run `pnpm --filter @haunt-kit/ui gen:tokens`.
- Every text color on every background we use must reach **4.5:1** (WCAG AA); borders and focus rings **3:1**. A test checks this for both themes. Add a new pair to `TEXT_PAIRS` before using it.

## Accessibility

- ✔ Anything you can tap is at least **44 × 44 px** (`var(--hk-target)`).
- ✔ Focus is always visible. Never `outline: none` (only `:focus:not(:focus-visible)`).
- ✔ Text is at least **16 px** (1rem). Big screens may use larger sizes.
- ✔ Every animation or transition has a `prefers-reduced-motion: reduce` fallback in the same file.
- ✔ Images have `alt` (use `alt=""` for decoration). Clickable things are buttons or links, not `<div onClick>`.
- Don't use color alone: a player's color always comes with their name. Scores are numbers, not only bar lengths.
- Dialogs use `<Modal>` (focus is trapped, Escape closes, focus returns). Announcements use `ToastRegion` (polite live region).
- Phone screens must work one-handed, in portrait, with the system text size up to 200%.
- Every screen has one `<h1>`. Headings go in order.

## Words

- ✔ Tone: **spooky but friendly**. Short, plain sentences. Under about 80 characters per line of UI text.
- ✔ No shouting (`!!`, `ERROR`, `FAILED`). Say what happened and what to do: "That room doesn't exist. Check the 4 letters." not "ERROR: ROOM NOT FOUND".
- Steady never gives medical advice and always says it isn't a medical device.
- Names are the player's own words: always shown as text, never as HTML.

## Assets

- Only original or license-free fonts, sounds, images and music. Sounds in this kit are synthesized (`packages/controller/src/sound.ts`).
