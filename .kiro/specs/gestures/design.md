# Design: Gesture Engine & Ghost Recordings

**Component:** `packages/gestures`  
**Owner:** Anish Pant

---

## 1. Directory Structure

```
packages/gestures/
├── specs/
│   └── _template.gesture.md       # Template for gesture-from-spec hook
├── src/
│   ├── index.ts                   # Public catalog and exports
│   ├── index.test.ts              # Package integration tests
│   ├── recording/
│   │   ├── schema.ts              # Zod schema for Ghost Recordings
│   │   ├── player.ts              # Realtime, speed, and immediate replay player
│   │   ├── adapter.ts             # Tiny adapter for host-sdk MockTransport
│   │   └── schema.test.ts         # Validation tests for all files in recordings/
│   ├── detectors/
│   │   ├── tilt.ts                # Continuous tilt with dead zone
│   │   ├── shake.ts               # Magnitude peak counting in sliding window
│   │   ├── flick.ts               # Jerk detection and directional impulse
│   │   ├── spin.ts                # Integrated rotation around screen normal
│   │   ├── hold-still.ts          # Variance thresholding on sliding window
│   │   ├── flip.ts                # Face-down gravity vector detection
│   │   ├── scream.ts              # RMS window loudness detection
│   │   ├── tap.ts                 # Direct tap passthrough
│   │   └── rep.ts                 # Hysteresis state machine for Steady reps
│   ├── pbt/
│   │   ├── generators.ts          # fast-check sample stream generators
│   │   ├── stillness.test.ts      # Stillness invariant tests
│   │   ├── rotation.test.ts       # 3D rotation invariance tests
│   │   ├── sample-rate.test.ts    # 30-120 Hz invariance tests
│   │   └── rep-counter.test.ts    # Rep counter accuracy tests
│   └── catalog.ts                 # Registry mapping names to Detectors
```

---

## 2. Core Interfaces and Types

### 2.1. Detector Registration

```ts
import type { Detector, Sample, GestureEvent } from "@haunt-kit/protocol";

export type AnyDetector = Detector<any>;

export class GestureCatalog {
  private detectors = new Map<string, AnyDetector>();

  register<T>(detector: Detector<T>): void {
    this.detectors.set(detector.name, detector);
  }

  get<T>(name: string): Detector<T> | undefined {
    return this.detectors.get(name);
  }

  list(): string[] {
    return Array.from(this.detectors.keys());
  }
}
```

### 2.2. Detector Sliding Window Helper

To prevent memory allocation churn during high-frequency sensor updates (up to 120 Hz), detectors use fixed-size circular ring buffers or timestamp-bounded FIFO queues:

```ts
export class TimedBuffer<T extends { t: number }> {
  private buffer: T[] = [];
  constructor(private windowMs: number) {}

  push(item: T): void {
    this.buffer.push(item);
    const cutoff = item.t - this.windowMs;
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) {
      this.buffer.shift();
    }
  }

  getItems(): readonly T[] {
    return this.buffer;
  }

  clear(): void {
    this.buffer = [];
  }
}
```

---

## 3. Mathematical Specifications

### 3.1. Shake Detection

1. Compute magnitude: $m(t) = \sqrt{a_x^2 + a_y^2 + a_z^2}$.
2. Remove mean/gravity: centered around $9.81$ m/s².
3. Count zero-crossings or peak excursions where $m(t) > \text{threshold}$.
4. If count $\ge \text{minPeaks}$ within $\text{windowMs}$ and time since last event $> \text{cooldownMs}$, emit `shake`.

### 3.2. Rep Detection (Steady)

1. Projection of gravity vector onto calibrated axis gives current inclination angle $\theta(t)$.
2. Smoothing with exponential moving average (EMA): $\bar{\theta}_t = \alpha \theta_t + (1-\alpha) \bar{\theta}_{t-1}$.
3. State machine:
   - `REST` $\rightarrow$ `ASCENDING`: when $\bar{\theta} > \theta_{rest} + \Delta_{hysteresis}$.
   - `ASCENDING` $\rightarrow$ `PEAK`: tracking $\max(\bar{\theta})$.
   - `PEAK` $\rightarrow$ `DESCENDING`: downward inflection.
   - `DESCENDING` $\rightarrow$ `COMPLETED`: returns within $\theta_{rest} + \Delta_{hysteresis}$.
4. Increment rep count; calculate range of motion $\text{ROM} = \theta_{max} - \theta_{rest}$ and elapsed duration.

---

## 4. Ghost Recording & Replay Design

### 4.1. Zod Schema

```ts
import { z } from "zod";

export const SampleSchema = z.object({
  t: z.number(),
  ax: z.number(),
  ay: z.number(),
  az: z.number(),
  gx: z.number(),
  gy: z.number(),
  gz: z.number(),
  alpha: z.number(),
  beta: z.number(),
  gamma: z.number(),
  rms: z.number().optional(),
});

export const RecordingSchema = z.object({
  meta: z.object({
    label: z.string(),
    os: z.enum(["iOS", "Android", "Desktop", "Synthetic"]),
    browser: z.string(),
    sampleRateHz: z.number(),
    recordedAt: z.string(),
  }),
  samples: z.array(SampleSchema),
});

export type GhostRecording = z.infer<typeof RecordingSchema>;
```

### 4.2. Replay Player Contract

```ts
export class ReplayPlayer {
  constructor(private recording: GhostRecording) {}

  playImmediate(onSample: (s: Sample) => void): void;
  playRealtime(onSample: (s: Sample) => void, onComplete?: () => void, speedMultiplier?: number): () => void;
}
```

### 4.3. MockTransport Adapter for host-sdk

```ts
export interface GhostPlayerAdapter {
  id: string;
  name: string;
  start(onSample: (s: Sample) => void): void;
  stop(): void;
}

export function createGhostPlayer(id: string, name: string, recording: GhostRecording): GhostPlayerAdapter;
```
