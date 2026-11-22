# Requirements: Gesture Engine & Ghost Recordings (`packages/gestures`)

**Spec Status:** Frozen Contract v0.1 (Tue Nov 17, 2026)  
**Owner:** Anish Pant (`packages/gestures`, `recordings/`)

---

## 1. Goal

Provide a robust, zero-dependency, pure TypeScript gesture recognition engine and recording replay system for **Haunt Kit**. The engine runs on phones (inside `@haunt-kit/controller`) and in tests, converting raw phone sensor streams into semantic `GestureEvent` objects without sending raw sensor streams across the network.

---

## 2. Detectors to Implement

Each detector implements the `Detector<Config>` contract from `@haunt-kit/protocol`:

```ts
export interface Detector<Config> {
  name: string;
  defaults: Config;
  create(config: Config): {
    push(s: Sample): GestureEvent[];
    reset(): void;
  };
}
```

### 2.1. Tilt (`tilt`)

- **Input:** `beta` (pitch), `gamma` (roll), or gravity vector projection from `ax, ay, az`.
- **Output:** Continuous normalized coordinates `x` (-1.0 to 1.0, left/right) and `y` (-1.0 to 1.0, forward/back).
- **Dead Zone:** Center dead zone where output is clamped to (0, 0) to avoid jitter.
- **Config Defaults:**
  - `maxRollDeg`: 45
  - `maxPitchDeg`: 45
  - `deadZone`: 0.08
  - `smoothingFactor`: 0.2

### 2.2. Shake (`shake`)

- **Input:** Acceleration magnitude `|a| = sqrt(ax² + ay² + az²)`.
- **Output:** Fires event `shake` with `intensity` when magnitude crosses a threshold $N$ times within a sliding window.
- **Invariant:** Must be rotation-invariant in 3D (independent of phone orientation).
- **Config Defaults:**
  - `threshold`: 18.0 m/s² (approx ~1.8g)
  - `minPeaks`: 3
  - `windowMs`: 600 ms
  - `cooldownMs`: 400 ms

### 2.3. Flick (`flick`)

- **Input:** Sharp high-derivative linear acceleration impulse.
- **Output:** Event `flick` with `direction` (0: left, 1: right, 2: up, 3: down, 4: forward) and `magnitude`.
- **Config Defaults:**
  - `jerkThreshold`: 35.0 m/s³
  - `windowMs`: 150 ms
  - `cooldownMs`: 500 ms

### 2.4. Spin (`spin`)

- **Input:** Rotation rate `gz` (around screen normal axis) or integrated orientation yaw `alpha`.
- **Output:** Fires event `spin` with `direction` (1 for clockwise, -1 for counter-clockwise) when integrated rotation passes 300° within 1.0 second.
- **Config Defaults:**
  - `targetDegrees`: 300
  - `windowMs`: 1000 ms
  - `cooldownMs`: 800 ms

### 2.5. Hold-Still (`hold-still`)

- **Input:** Acceleration vector variance over a sliding temporal window.
- **Output:**
  - Fires `hold-still` (state: 1) when variance stays below threshold for `holdDurationMs`.
  - Fires `hold-still-broken` (state: 0) when motion exceeding threshold occurs.
- **Config Defaults:**
  - `varianceThreshold`: 0.4 m/s²
  - `holdDurationMs`: 1200 ms

### 2.6. Flip (`flip`)

- **Input:** Gravitational acceleration along z-axis (`az`).
- **Output:** Fires `flip` with `faceDown: 1` when $az < -7.0$ m/s² and holds for 200 ms; fires `faceDown: 0` when flipped back.
- **Config Defaults:**
  - `faceDownThreshold`: -7.0 m/s²
  - `holdMs`: 200 ms

### 2.7. Scream (`scream`)

- **Input:** `rms` (0..1 audio loudness calculated client-side on the phone).
- **Output:** Fires `scream` with `peak` and `average` when RMS stays above threshold for minimum duration.
- **Config Defaults:**
  - `rmsThreshold`: 0.65
  - `minDurationMs`: 300 ms
  - `cooldownMs`: 1000 ms

### 2.8. Tap (`tap`)

- **Input:** Screen touch event forwarded as synthetic sample or touch trigger.
- **Output:** Fires `tap` with `x, y` normalized screen coordinates.

### 2.9. Rep Counter for Steady (`rep`)

- **Input:** Gravitational pitch/roll vector angle from calibrated baseline.
- **Output:** Fires `rep` with `count`, `romDeg` (range of motion in degrees), `tempoSec`, `fullRange` (0 or 1), `tooFast` (0 or 1).
- **Logic:** Two-phase state machine (inflection upward passing threshold, inflection downward returning to rest) with hysteresis to prevent double-counting.
- **Config Defaults:**
  - `minRomDeg`: 45
  - `hysteresisDeg`: 10
  - `minTempoSec`: 1.2

---

## 3. Ghost Recordings Specification

Others (Yadnesh for `host-sdk` MockTransport, Viviana for `seance-party` lobby) depend on this by **Thu Nov 19**.

### 3.1. File Schema (Zod)

Recording files stored in `recordings/*.json`:

```ts
{
  meta: {
    label: string,
    os: "iOS" | "Android" | "Desktop" | "Synthetic",
    browser: string,
    sampleRateHz: number,
    recordedAt: string
  },
  samples: Sample[]
}
```

### 3.2. Replay Player

- Replay modes:
  1. `realtime`: emits samples on monotonic timer matching `sample.t`.
  2. `speed(multiplier)`: fast or slow motion.
  3. `immediate`: returns or feeds all samples at once synchronously for test suites.
- Loop and pause controls.

### 3.3. MockTransport Adapter Interface

A minimal adapter interface that `@haunt-kit/host-sdk` can consume to simulate a connected phone:

```ts
export interface GhostPlayerAdapter {
  id: string;
  name: string;
  start(onSample: (s: Sample) => void): void;
  stop(): void;
}
```

---

## 4. Property-Based Testing (PBT) Requirements

Using `fast-check` to mathematically prove invariants:

1. **Stillness Invariant:** A stream with small noise ($|a - 9.81| < 0.2$, $|\omega| < 2.0$) NEVER triggers `shake`, `flick`, or `spin`.
2. **Rotation Invariance:** Rotating any acceleration stream by an arbitrary 3D rotation matrix $R \in SO(3)$ produces the exact same `shake` event timestamps.
3. **Sampling Rate Invariance:** Resampling a gesture stream between 30 Hz and 120 Hz produces identical detection counts.
4. **Temporal Causality:** For every event $e$, $s_0.t \le e.t \le s_{end}.t$.
5. **Rep Determinism:** A sequence of $N$ synthetic reps with noise counts as exactly $N$. Holding still or micro-movements below `minRomDeg` never increments rep count.
6. **Schema Validity:** Every file in `recordings/*.json` validates against the Zod schema.
