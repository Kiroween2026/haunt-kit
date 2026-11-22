import { Button } from "@haunt-kit/ui";
import type { CoachView } from "../coach";
import type { Exercise } from "../exercises";

type Props = { exercise: Exercise; view: CoachView; voiceOnly: boolean; demo: boolean; onStop: () => void };

export function Live({ exercise, view, voiceOnly, demo, onStop }: Props) {
  const calibrating = view.phase === "calibrating";
  const fb = view.lastFeedback;
  const max = Math.max(view.targetDeg * 1.25, view.status.angleDeg, 1);
  const pct = (deg: number) => `${Math.min(100, Math.round((deg / max) * 100))}%`;

  if (voiceOnly) {
    return (
      <div className="st-voice-only">
        <h1>{exercise.name}</h1>
        <p className="st-count" aria-label={`${view.count} reps`}>
          {calibrating ? "…" : view.count}
        </p>
        <p className="st-note" role="status">
          {calibrating ? "Hold still at the start position." : (fb?.text ?? "Listening.")}
        </p>
        <Button size="large" variant="danger" onClick={onStop}>
          Stop
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1>
        {exercise.name}
        {demo ? " (demo)" : ""}
      </h1>
      {calibrating ? (
        <div className="st-stack">
          <p className="st-feedback" role="status">
            Hold still at the start position.
          </p>
          <div
            className="st-gauge"
            role="progressbar"
            aria-label="Setting the start position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(view.status.calibration * 100)}
          >
            <div
              className="st-gauge__fill"
              style={{ width: `${Math.round(view.status.calibration * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <p className="st-count" aria-label={`${view.count} reps`}>
            {view.count}
          </p>
          <p className={`st-feedback st-feedback--${fb?.kind ?? "good"}`} role="status" aria-live="polite">
            {fb ? `Rep ${view.count}: ${fb.text}` : "Start your first rep."}
          </p>
          <div className="st-stack">
            <div
              className="st-gauge"
              role="meter"
              aria-label="Angle"
              aria-valuemin={0}
              aria-valuemax={Math.round(max)}
              aria-valuenow={Math.round(view.status.angleDeg)}
              aria-valuetext={`${Math.round(view.status.angleDeg)} degrees. Aim for ${view.targetDeg}.`}
            >
              <div className="st-gauge__fill" style={{ width: pct(view.status.angleDeg) }} />
              <div className="st-gauge__mark" style={{ left: pct(view.targetDeg) }} aria-hidden="true" />
            </div>
            <div className="st-gauge__labels">
              <span>{Math.round(view.status.angleDeg)}°</span>
              <span>Aim for {view.targetDeg}°</span>
            </div>
          </div>
        </>
      )}
      <Button size="large" variant="danger" onClick={onStop}>
        Stop
      </Button>
    </>
  );
}
