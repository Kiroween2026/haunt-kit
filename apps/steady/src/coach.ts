// Owner: Anish (built by Yadnesh while Anish is unavailable).
// The coach: samples go in, and out come the angle, the count, feedback and speech.
import { createRepDetector, type RepStatus } from "@haunt-kit/gestures";
import type { Sample } from "@haunt-kit/protocol";
import type { Exercise } from "./exercises";
import { phraseFor, SteadySession, type Feedback } from "./session";
import type { Speaker } from "./speech";
import type { RepRecord, SessionSummary } from "./summary";
import { formatDeg } from "./report";

export type CoachView = {
  phase: SteadySession["phase"];
  status: RepStatus;
  count: number;
  lastFeedback: Feedback | null;
  /** The angle the exercise is aiming for, in degrees. */
  targetDeg: number;
  /** The smallest angle that counts as a rep, in degrees. */
  minDeg: number;
};

export type CoachOptions = {
  exercise: Exercise;
  id: string;
  speaker: Speaker;
  /** Say the instructions too (not only the counts). */
  voiceOnly: boolean;
  now?: () => number;
  onRep?: (rep: RepRecord, feedback: Feedback) => void;
};

export class Coach {
  readonly session: SteadySession;
  private readonly detector;
  private readonly opts: CoachOptions;
  private announced = false;

  constructor(opts: CoachOptions) {
    this.opts = opts;
    this.session = new SteadySession(opts.exercise, opts.id, opts.now);
    this.detector = createRepDetector(opts.exercise.rep);
  }

  /** Call right after the Start tap. */
  begin(): void {
    if (this.opts.voiceOnly) this.opts.speaker.say("Hold still at the start position for two seconds.");
  }

  push(sample: Sample): CoachView {
    if (this.session.phase !== "ended") {
      for (const event of this.detector.push(sample)) {
        const wasCalibrating = this.session.phase === "calibrating";
        const result = this.session.onEvent(event);
        if (wasCalibrating && this.session.phase === "active" && !this.announced) {
          this.announced = true;
          if (this.opts.voiceOnly) this.opts.speaker.say("Ready. Start your reps.");
        }
        if (result) {
          this.opts.speaker.say(phraseFor(result.rep.count, result.feedback));
          this.opts.onRep?.(result.rep, result.feedback);
        }
      }
    }
    return this.view();
  }

  view(): CoachView {
    return {
      phase: this.session.phase,
      status: this.detector.status(),
      count: this.session.count,
      lastFeedback: this.session.lastFeedback,
      targetDeg: this.opts.exercise.rep.targetRomDeg ?? 70,
      minDeg: this.opts.exercise.rep.minRomDeg ?? 45,
    };
  }

  stop(): SessionSummary {
    const summary = this.session.end();
    if (this.opts.voiceOnly || summary.reps > 0) {
      this.opts.speaker.say(
        summary.reps === 0
          ? "Session finished. No reps were counted."
          : `Session finished. ${summary.reps} ${summary.reps === 1 ? "rep" : "reps"}. Average range ${formatDeg(summary.avgRomDeg)}.`,
      );
    }
    return summary;
  }
}
