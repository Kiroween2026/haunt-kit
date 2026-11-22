// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Banshee Scream-off: the loudest sustained scream wins. Loudness is measured on each phone.
import type { UiView } from "@haunt-kit/protocol";
import type { GameEvent, Inputs, MiniGame, PlayerId } from "./types";

export const READY_MS = 3000;
export const SCREAM_MS = 6000;
/** A scream counts when it is loud for this long. */
export const WINDOW_MS = 2000;
/** Quieter than this is not a scream. */
export const MIN_SCORE = 0.05;

type Sample = { t: number; rms: number };

/** The loudest average over any `windowMs` stretch. Zero if the samples cover less than the window. */
export function bestWindow(samples: readonly Sample[], windowMs = WINDOW_MS): number {
  let best = 0;
  let lo = 0;
  let sum = 0;
  for (let hi = 0; hi < samples.length; hi++) {
    sum += samples[hi]!.rms;
    while (samples[hi]!.t - samples[lo]!.t > windowMs) sum -= samples[lo++]!.rms;
    const span = samples[hi]!.t - samples[lo]!.t;
    if (span >= windowMs * 0.9) best = Math.max(best, sum / (hi - lo + 1));
  }
  return best;
}

/** Rank points: the loudest gets the most. Players who tied share the higher points. Quiet players get 0. */
export function rankPoints(scores: ReadonlyMap<PlayerId, number>): Map<PlayerId, number> {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const n = sorted.length;
  const out = new Map<PlayerId, number>();
  for (const [id, score] of sorted) {
    const firstWithScore = sorted.findIndex(([, s]) => s === score);
    out.set(id, score < MIN_SCORE ? 0 : n - firstWithScore);
  }
  return out;
}

export class BansheeGame implements MiniGame {
  readonly kind = "banshee" as const;
  elapsedMs = 0;
  private readonly samples = new Map<PlayerId, Sample[]>();
  private readonly everyone: PlayerId[];
  private readonly active: Set<PlayerId>;
  private announced: "ready" | "scream" | "end" = "ready";

  constructor(players: readonly PlayerId[]) {
    this.everyone = [...players];
    this.active = new Set(players);
    for (const id of players) this.samples.set(id, []);
  }

  get phase(): "ready" | "scream" | "done" {
    if (this.elapsedMs < READY_MS) return "ready";
    return this.elapsedMs < READY_MS + SCREAM_MS ? "scream" : "done";
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** Seconds until the scream starts, or until it ends. */
  get secondsLeft(): number {
    const left = this.phase === "ready" ? READY_MS - this.elapsedMs : READY_MS + SCREAM_MS - this.elapsedMs;
    return Math.max(0, Math.ceil(left / 1000));
  }

  /** The loudness a player is making right now (for drawing). */
  level(id: PlayerId): number {
    const s = this.samples.get(id);
    return s && s.length > 0 ? s[s.length - 1]!.rms : 0;
  }

  scores(): Map<PlayerId, number> {
    return new Map(this.everyone.map((id) => [id, bestWindow(this.samples.get(id) ?? [])]));
  }

  tick(dtMs: number, inputs: Inputs): GameEvent[] {
    if (this.done) return [];
    const events: GameEvent[] = [];
    this.elapsedMs += Math.min(Math.max(dtMs, 0), 250);
    if (this.phase === "scream") {
      if (this.announced === "ready") {
        this.announced = "scream";
        events.push({ type: "scream-start" });
      }
      for (const id of this.active) {
        const rms = Math.min(1, Math.max(0, inputs.get(id)?.rms ?? 0));
        this.samples.get(id)!.push({ t: this.elapsedMs, rms: Number.isFinite(rms) ? rms : 0 });
      }
    } else if (this.phase === "done" && this.announced !== "end") {
      this.announced = "end";
      events.push({ type: "scream-end" });
    }
    return events;
  }

  points(): Map<PlayerId, number> {
    return this.done ? rankPoints(this.scores()) : new Map(this.everyone.map((id) => [id, 0]));
  }

  phoneUi(): UiView {
    if (this.phase === "ready") return { view: "scream", title: "Get ready…", hint: "Take a big breath." };
    return { view: "scream", title: "Scream!", hint: "Loud and long. Sound stays on your phone." };
  }

  forfeit(id: PlayerId): void {
    this.active.delete(id);
  }
}
