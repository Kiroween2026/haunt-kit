// Owner: Anish (built by Yadnesh while Anish is unavailable).
// One exercise session: turns the rep detector's events into reps, feedback and a summary.
import type { GestureEvent } from "@haunt-kit/protocol";
import type { Exercise } from "./exercises";
import { summarize, type RepRecord, type SessionSummary } from "./summary";

export type Phase = "calibrating" | "active" | "ended";

export type Feedback = {
  kind: "good" | "too-fast" | "partial";
  /** Shown on the screen. */
  text: string;
  /** Spoken after the rep number. Empty for a good rep. */
  spoken: string;
};

/** What to tell the person about one rep. Too fast comes first: it is the one that can hurt. */
export function feedbackFor(rep: Pick<RepRecord, "fullRange" | "tooFast">): Feedback {
  if (rep.tooFast) return { kind: "too-fast", text: "Too fast", spoken: "Slow down" };
  if (!rep.fullRange) return { kind: "partial", text: "Not full range", spoken: "Go a little higher" };
  return { kind: "good", text: "Good rep", spoken: "" };
}

/** What to say out loud for a rep: the number, then the advice if any. */
export function phraseFor(count: number, fb: Feedback): string {
  return fb.spoken ? `${count}. ${fb.spoken}.` : `${count}.`;
}

export class SteadySession {
  phase: Phase = "calibrating";
  readonly reps: RepRecord[] = [];
  lastFeedback: Feedback | null = null;
  private startedAtMs: number;
  private endedAtMs: number | null = null;

  constructor(
    readonly exercise: Exercise,
    readonly id: string,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.startedAtMs = nowMs();
  }

  get count(): number {
    return this.reps.length;
  }

  /** Feeds one event from the rep detector. Returns the feedback if it was a rep. */
  onEvent(e: GestureEvent): { rep: RepRecord; feedback: Feedback } | null {
    if (this.phase === "ended") return null;
    if (e.name === "rep-calibrated") {
      this.phase = "active";
      this.startedAtMs = this.nowMs();
      return null;
    }
    if (e.name !== "rep" || this.phase !== "active" || !e.data) return null;
    const d = e.data;
    const rep: RepRecord = {
      count: this.reps.length + 1,
      romDeg: d.romDeg ?? 0,
      tempoSec: d.tempoSec ?? 0,
      fullRange: d.fullRange === 1,
      tooFast: d.tooFast === 1,
    };
    this.reps.push(rep);
    this.lastFeedback = feedbackFor(rep);
    return { rep, feedback: this.lastFeedback };
  }

  end(): SessionSummary {
    this.phase = "ended";
    this.endedAtMs ??= this.nowMs();
    return this.summary();
  }

  /** The summary so far (also valid before the session ends). */
  summary(): SessionSummary {
    const end = this.endedAtMs ?? this.nowMs();
    return summarize({
      id: this.id,
      exercise: this.exercise.id,
      startedAt: new Date(this.startedAtMs).toISOString(),
      durationSec: (end - this.startedAtMs) / 1000,
      detail: this.reps,
    });
  }
}
