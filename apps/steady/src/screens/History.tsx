import { useState } from "react";
import { Button, Card, Modal } from "@haunt-kit/ui";
import { exerciseName, formatDate, formatDeg } from "../report";
import type { SessionSummary } from "../summary";

type Props = {
  sessions: readonly SessionSummary[];
  onReport: (sessions: SessionSummary[]) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
};

export function History({ sessions, onReport, onDelete, onBack }: Props) {
  const [asking, setAsking] = useState<SessionSummary | null>(null);
  return (
    <>
      <h1>My sessions</h1>
      <p className="st-note">Saved on this phone only.</p>
      {sessions.length === 0 ? <p>No sessions yet. Do an exercise and it will show up here.</p> : null}
      <div className="st-stack">
        {sessions.map((s) => (
          <Card key={s.id} title={exerciseName(s.exercise)} level={2}>
            <p>
              {formatDate(s.startedAt)}: {s.reps} {s.reps === 1 ? "rep" : "reps"}
              {s.reps > 0 ? `, average ${formatDeg(s.avgRomDeg)}` : ""}
            </p>
            <div className="st-row">
              <Button
                variant="secondary"
                aria-label={`Report for ${exerciseName(s.exercise)}, ${formatDate(s.startedAt)}`}
                onClick={() => onReport([s])}
              >
                Report
              </Button>
              <Button
                variant="danger"
                aria-label={`Delete ${exerciseName(s.exercise)}, ${formatDate(s.startedAt)}`}
                onClick={() => setAsking(s)}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="st-stack">
        {sessions.length > 1 ? (
          <Button onClick={() => onReport([...sessions])}>Report for all sessions</Button>
        ) : null}
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </div>
      <Modal
        open={asking !== null}
        title="Delete this session?"
        onClose={() => setAsking(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (asking) onDelete(asking.id);
                setAsking(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>It will be removed from this phone.</p>
      </Modal>
    </>
  );
}
