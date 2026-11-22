# Design: steady

```
phone sensors ─▶ MotionSampler ─┐                       ┌─▶ live screen (count, angle gauge, feedback)
demo person ───▶ demoSamples ───┴─▶ Coach ──▶ rep detector (@haunt-kit/gestures)
                                       │            │ events: rep-calibrated, rep
                                       │            └─ status(): angle, calibration, count
                                       ├─▶ SteadySession ─▶ summary ─▶ IndexedDB history ─▶ report
                                       └─▶ Speaker (speechSynthesis)
```

- **Rep detector** (in gestures, status() added): the angle is how far gravity, as the phone sees it, has turned from the calibrated start position. That works however the phone is held. Events: `rep-calibrated`, then `rep` with `count`, `romDeg`, `tempoSec`, `fullRange`, `tooFast`.
- **Per-exercise settings** (`exercises.ts`): minimum range, full-range target, minimum time per rep.
- **Pure logic** (no React): `session.ts`, `summary.ts`, `report.ts`, `settings.ts`, `history.ts`, `coach.ts`, `speech.ts`. Screens only draw.
- **Speech:** `unlock()` speaks a silent utterance inside the tap. `say()` cuts off the previous words so counts never pile up.
- **Sources:** `motionSource` (real sensors; a desktop that says "granted" but sends nothing is told "no sensors") and `demoSource` (deterministic: 2 good reps, one short, one fast, one good).
- **Themes:** lantern, or `contrast` when high contrast is on. Text size sets the root font size.
