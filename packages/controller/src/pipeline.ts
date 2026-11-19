// Owner: Yadnesh. Decides, per sample, what the phone sends: raw frames, gesture events, or nothing.
//
// Detection runs ON THE PHONE. Raw frames are only sent when the game needs continuous input
// (tilt, scream) or when no detector can cover the current view. This cuts traffic to the relay
// and keeps raw sensor data on the phone unless it's needed.

import type { ControlView, Detector, GestureEvent, Sample } from "@haunt-kit/protocol";
import { FrameBatcher } from "@haunt-kit/host-sdk";

export type InputMode = "raw" | "events" | "off";

/** Detector names that can replace raw frames for a view. */
const VIEW_DETECTORS: Partial<Record<ControlView, string[]>> = {
  still: ["hold-still"],
};

/**
 * - tilt, scream: raw (continuous input; rms rides along in the frames)
 * - still: events if a hold-still detector is available, else raw so the host can judge movement
 * - tap: events (tap gestures come from the button)
 * - wait: off
 * `forceRaw` (?raw=1) streams raw frames in every view, for the Séance MCP and debugging.
 */
export function chooseInputMode(
  view: ControlView,
  available: ReadonlySet<string>,
  forceRaw = false,
): InputMode {
  if (forceRaw) return "raw";
  if (view === "tilt" || view === "scream") return "raw";
  if (view === "tap") return "events";
  if (view === "wait") return "off";
  const needed = VIEW_DETECTORS[view] ?? [];
  return needed.length > 0 && needed.every((n) => available.has(n)) ? "events" : "raw";
}

export type PipelineOutput = { frames: Sample[] | null; gestures: GestureEvent[] };

export class InputPipeline {
  private readonly running: { name: string; instance: ReturnType<Detector<unknown>["create"]> }[];
  private readonly available: Set<string>;
  private readonly batcher = new FrameBatcher();
  private mode: InputMode = "off";

  constructor(
    detectors: readonly Detector<unknown>[],
    private readonly forceRaw = false,
  ) {
    this.running = detectors.map((d) => ({ name: d.name, instance: d.create(d.defaults) }));
    this.available = new Set(detectors.map((d) => d.name));
    this.setView("wait");
  }

  get inputMode(): InputMode {
    return this.mode;
  }

  setView(view: ControlView): void {
    const next = chooseInputMode(view, this.available, this.forceRaw);
    if (next !== this.mode) {
      this.batcher.clear();
      for (const d of this.running) d.instance.reset();
    }
    this.mode = next;
  }

  /** Feeds one sample. Detectors always run (a shake counts in any view); frames only in raw mode. */
  push(sample: Sample, now: number): PipelineOutput {
    const gestures: GestureEvent[] = [];
    if (this.mode !== "off") {
      for (const d of this.running) {
        try {
          gestures.push(...d.instance.push(sample));
        } catch (e) {
          console.error(`haunt-kit: detector ${d.name} threw`, e);
        }
      }
    }
    const frames = this.mode === "raw" ? this.batcher.push(sample, now) : null;
    return { frames, gestures };
  }
}
