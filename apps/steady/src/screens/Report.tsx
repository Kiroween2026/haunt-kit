import { Button } from "@haunt-kit/ui";
import { REPORT_NOTE, exerciseName, formatDate, formatDeg, formatSec, sessionRows } from "../report";
import type { SessionSummary } from "../summary";

type Props = { sessions: readonly SessionSummary[]; onBack: () => void };

export function Report({ sessions, onBack }: Props) {
  return (
    <>
      <div className="st-row st-noprint">
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </div>
      <article className="st-report" aria-label="Report for my therapist">
        <h1 style={{ color: "CanvasText" }}>Exercise report</h1>
        {sessions.map((s) => (
          <section
            key={s.id}
            className="st-stack"
            aria-label={`${exerciseName(s.exercise)}, ${formatDate(s.startedAt)}`}
          >
            <h2>
              {exerciseName(s.exercise)}, {formatDate(s.startedAt)}
            </h2>
            <table className="st-table">
              <tbody>
                {sessionRows(s)
                  .slice(2)
                  .map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <td>{r.value}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {s.detail.length > 0 ? (
              <table className="st-table">
                <caption>Each rep</caption>
                <thead>
                  <tr>
                    <th scope="col">Rep</th>
                    <th scope="col">Range</th>
                    <th scope="col">Time</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {s.detail.map((r) => (
                    <tr key={r.count}>
                      <td>{r.count}</td>
                      <td>{formatDeg(r.romDeg)}</td>
                      <td>{formatSec(r.tempoSec)}</td>
                      <td>
                        {[r.tooFast ? "Too fast" : "", r.fullRange ? "" : "Not full range"]
                          .filter(Boolean)
                          .join(", ") || "Good"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        ))}
        <p>{REPORT_NOTE}</p>
      </article>
    </>
  );
}
