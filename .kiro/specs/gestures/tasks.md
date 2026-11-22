# Tasks: Gesture Engine & Ghost Recordings

> Phases 3 and 4 (flick, spin, flip, scream, tap, rep, catalog, property tests, validation against recordings) were built by Yadnesh while Anish was unavailable. Anish: review them and change what you want.

**Owner:** Anish Pant  
**Component:** `packages/gestures`

---

## Phase 1: Ghost Recordings Schema & Replay Player (Wed Nov 18)

_Goal: Unblock Yadnesh (host-sdk MockTransport) and Viviana (seance-party lobby) with fake player capabilities._

- [ ] **Task 1.1: Zod Schema Definition & Validation**
  - Implement `src/recording/schema.ts` with `SampleSchema` and `RecordingSchema`.
  - Add schema unit tests in `src/recording/schema.test.ts`.
- [ ] **Task 1.2: Replay Player Implementation**
  - Implement `ReplayPlayer` supporting `playImmediate` (synchronous for tests) and `playRealtime` (with speed multiplier).
  - Add unit tests verifying timing fidelity and sample ordering.
- [ ] **Task 1.3: Host SDK MockTransport Adapter**
  - Implement `GhostPlayerAdapter` and `createGhostPlayer` factory.
  - Export adapter from `packages/gestures`.
- [ ] **Task 1.4: Ingest Initial iPhone Baseline Recordings**
  - Move captured iPhone recordings into `recordings/` (e.g. `still-iphone.json`, `shake-hard-iphone.json`, `tilt-iphone.json`).
  - Verify all recorded files pass `RecordingSchema.parse()`.

---

## Phase 2: Core Detectors - Tilt, Shake, Hold-Still (Thu Nov 19)

_Goal: Deliver first playable minigame inputs (Ouija Planchette & Hold Still)._

- [ ] **Task 2.1: Tilt Detector**
  - Implement `src/detectors/tilt.ts` with continuous normalized coordinates `(-1..1)` and configurable center dead zone.
  - Add unit tests for dead zone clamping and orientation bounds.
- [ ] **Task 2.2: Shake Detector**
  - Implement `src/detectors/shake.ts` using 3D acceleration magnitude peak counting in a sliding window.
  - Ensure rotation invariance and cooldown enforcement.
- [ ] **Task 2.3: Hold-Still Detector**
  - Implement `src/detectors/hold-still.ts` tracking acceleration variance over time.
  - Emit `hold-still` on stillness threshold and `hold-still-broken` on movement.

---

## Phase 3: Secondary Detectors - Flick, Spin, Flip, Scream (Fri Nov 20)

_Goal: Complete party game gestures and sound detection._

- [x] **Task 3.1: Flick Detector**
  - Implement `src/detectors/flick.ts` detecting sharp acceleration impulses and reporting direction.
- [x] **Task 3.2: Spin Detector**
  - Implement `src/detectors/spin.ts` tracking integrated rotation around screen normal (`gz` / `alpha`) up to 300°.
- [x] **Task 3.3: Flip Detector**
  - Implement `src/detectors/flip.ts` detecting face-down orientation ($az < -7.0$ m/s²).
- [x] **Task 3.4: Scream Detector**
  - Implement `src/detectors/scream.ts` measuring phone-side RMS sustained loudness over a duration window.
- [x] **Task 3.5: Tap Detector**
  - Implement `src/detectors/tap.ts` forwarding touch tap events.

---

## Phase 4: Rep Detector, Catalog, and PBT Suite (Sat Nov 21)

_Goal: Physical therapy rep counter and mathematical verification._

- [x] **Task 4.1: Steady Rep Detector**
  - Implement `src/detectors/rep.ts` using gravity vector angle tracking, EMA smoothing, and hysteresis state machine.
  - Report rep count, range of motion (ROM) in degrees, and tempo warnings.
- [x] **Task 4.2: Gesture Catalog**
  - Implement `src/catalog.ts` registering all 9 detectors with default configurations.
  - Export catalog and detector types from `src/index.ts`.
- [x] **Task 4.3: Property-Based Testing (PBT) Suite with fast-check**
  - Implement synthetic stream generators: `stillStreamGen`, `shakingStreamGen`, `rotatingStreamGen`, `repStreamGen`.
  - Invariant 1: Still or slightly noisy phone never fires shake, flick, or spin.
  - Invariant 2: Shake detector results are invariant under 3D rotation ($SO(3)$).
  - Invariant 3: Sample-rate invariance across 30 Hz to 120 Hz.
  - Invariant 4: Event timestamps are causally bounded ($t_{sample\_0} \le t_{event} \le t_{sample\_end}$).
  - Invariant 5: $N$ synthetic reps with noise count as exactly $N$; micro-motions never increment rep count.
- [x] **Task 4.4: Validation Against Real iPhone Recordings**
  - Run all detectors against benchmark recordings in `recordings/`.
  - Log any discovered bugs or calibration adjustments in `KIRO_LOG.md`.
