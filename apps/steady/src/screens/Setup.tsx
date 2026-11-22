import { Button, Card } from "@haunt-kit/ui";
import type { Exercise } from "../exercises";

type Props = {
  exercise: Exercise;
  problem: "denied" | "no-sensors" | null;
  onStart: () => void;
  onDemo: () => void;
  onBack: () => void;
};

const PROBLEMS = {
  denied: "Motion is blocked. Reload the page and tap Allow when asked. Or try the demo.",
  "no-sensors": "This device has no motion sensors. Open Steady on your phone, or try the demo.",
} as const;

export function Setup({ exercise, problem, onStart, onDemo, onBack }: Props) {
  return (
    <>
      <h1>{exercise.name}</h1>
      <Card title="How to hold the phone" level={2}>
        <p>{exercise.holding}</p>
        <ol className="st-list">
          <li>Tap Start.</li>
          <li>Hold the start position for 2 seconds.</li>
          <li>Do your reps. Steady counts them out loud.</li>
          <li>Tap Stop when you are done.</li>
        </ol>
      </Card>
      {problem ? (
        <p role="alert" className="st-feedback st-feedback--partial">
          {PROBLEMS[problem]}
        </p>
      ) : null}
      <div className="st-stack">
        <Button size="large" onClick={onStart}>
          Start
        </Button>
        <Button variant="secondary" onClick={onDemo}>
          Try the demo (no phone needed)
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </div>
    </>
  );
}
