import { Button, Card } from "@haunt-kit/ui";
import { sessionRows } from "../report";
import type { SessionSummary } from "../summary";

type Props = { summary: SessionSummary; saved: boolean; onReport: () => void; onDone: () => void };

export function SummaryTable({ summary }: { summary: SessionSummary }) {
  return (
    <table className="st-table">
      <caption className="hk-visually-hidden">Session summary</caption>
      <tbody>
        {sessionRows(summary).map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Summary({ summary, saved, onReport, onDone }: Props) {
  return (
    <>
      <h1>{summary.reps === 0 ? "No reps counted" : "Well done"}</h1>
      <Card>
        <div className="st-stack">
          <SummaryTable summary={summary} />
          <p className="st-note">
            {summary.reps === 0
              ? "Nothing was saved."
              : saved
                ? "Saved on this phone."
                : "Could not save this session."}
          </p>
        </div>
      </Card>
      <div className="st-stack">
        {summary.reps > 0 ? (
          <Button size="large" onClick={onReport}>
            Report for my therapist
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    </>
  );
}
