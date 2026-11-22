# Gestures Steering

Owner: **Anish Pant** (`packages/gestures`, `recordings/`, `apps/steady`).

---

## 1. Units and Coordinates

All detectors receive raw or normalized `Sample` streams as defined in `@haunt-kit/protocol`:

| Field        | Description                              | Unit                   | Range / Reference                   |
| ------------ | ---------------------------------------- | ---------------------- | ----------------------------------- |
| `t`          | Monotonic timestamp                      | milliseconds (ms)      | `t >= 0`                            |
| `ax, ay, az` | Acceleration including gravity           | m/s²                   | Earth gravity at rest is ~9.81 m/s² |
| `gx, gy, gz` | Rotation rate                            | degrees/second (deg/s) | Screen/body axes                    |
| `alpha`      | Compass heading / yaw around Z           | degrees (deg)          | 0° to 360°                          |
| `beta`       | Pitch (front-to-back tilt)               | degrees (deg)          | -180° to 180°                       |
| `gamma`      | Roll (left-to-right tilt)                | degrees (deg)          | -90° to 90°                         |
| `rms`        | Audio loudness (RMS calculated on phone) | unitless               | 0.0 to 1.0 (clamped)                |

---

## 2. Core Architectural Rules

1. **Pure TypeScript, Zero Browser APIs:** Detectors must never reference `window`, `document`, `navigator`, `AudioContext`, or any DOM/Web API. They must run identically on an iPhone in Safari, inside a Node.js test runner, or in a worker.
2. **Never change a threshold without testing against recordings:**
   - Any proposed threshold adjustment MUST be validated against the entire benchmark suite in `recordings/`.
   - Never tune a threshold by guessing or looking at a single edge case in isolation.
3. **Rotation Invariance for Shake:** Shake detection relies on acceleration magnitude variance and zero-crossings, NOT fixed single-axis peaks, ensuring detection works regardless of how the phone is oriented in hand.
4. **Deterministic PBT:** Property-based tests with `fast-check` must prove stability across sample rates from 30 Hz to 120 Hz.
5. **No Memory Leaks:** Detectors must maintain sliding windows with bounded buffer lengths and implement `reset()` cleanly.
