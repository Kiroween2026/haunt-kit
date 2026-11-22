// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Turns what phones send (frames and gestures) into the Input the minigames read.
import type { GestureEvent, Sample } from "@haunt-kit/protocol";
import { clamp } from "../game/rng";
import { NO_INPUT, type Input, type PlayerId } from "../game/types";

/** Tilt in degrees that counts as full tilt. */
export const FULL_TILT_DEG = 45;
/** Smaller tilts than this are ignored, so a phone resting on a table doesn't drift the planchette. */
export const DEAD_ZONE = 0.06;

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/** Right (gamma) and down (beta) are positive, like a ball rolling downhill. */
export function tiltFromSample(s: Pick<Sample, "beta" | "gamma">): { x: number; y: number } {
  const x = clamp(finite(s.gamma) / FULL_TILT_DEG, -1, 1);
  const y = clamp(finite(s.beta) / FULL_TILT_DEG, -1, 1);
  return { x: Math.abs(x) < DEAD_ZONE ? 0 : x, y: Math.abs(y) < DEAD_ZONE ? 0 : y };
}

export class InputTracker {
  private readonly inputs = new Map<PlayerId, Input>();

  private get(id: PlayerId): Input {
    return this.inputs.get(id) ?? { ...NO_INPUT, tilt: { x: 0, y: 0 } };
  }

  onFrames(id: PlayerId, samples: readonly Sample[]): void {
    const last = samples[samples.length - 1];
    if (!last) return;
    this.inputs.set(id, {
      ...this.get(id),
      tilt: tiltFromSample(last),
      rms: clamp(finite(last.rms ?? 0), 0, 1),
    });
  }

  /** hold-still means frozen; hold-still-broken means moved. */
  onGesture(id: PlayerId, event: GestureEvent): void {
    if (event.name === "hold-still") this.inputs.set(id, { ...this.get(id), frozen: true });
    else if (event.name === "hold-still-broken") this.inputs.set(id, { ...this.get(id), frozen: false });
  }

  /** Called when a new minigame starts, so a stale "frozen" from before doesn't carry over. */
  resetFrozen(): void {
    for (const [id, input] of this.inputs) this.inputs.set(id, { ...input, frozen: false });
  }

  forget(id: PlayerId): void {
    this.inputs.delete(id);
  }

  input(id: PlayerId): Input {
    return this.get(id);
  }
}
