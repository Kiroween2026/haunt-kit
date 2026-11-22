// Owner: Anish (built by Yadnesh while Anish is unavailable).
// The numbers and words for the therapist report. The screen only lays these out.
import { exerciseById } from "./exercises";
import type { SessionSummary } from "./summary";

export const REPORT_NOTE =
  "Counted by Steady with the phone's motion sensors. Steady is not a medical device and gives no medical advice. Angles are how far the phone turned from its start position.";

export function exerciseName(id: string): string {
  return exerciseById(id)?.name ?? id;
}

export function formatDate(iso: string, locale = "en-US", timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

export const formatDeg = (n: number): string => `${Math.round(n)}°`;
export const formatSec = (n: number): string => `${n.toFixed(1)} s`;

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

export type ReportRow = { label: string; value: string };

/** The headline numbers for one session. */
export function sessionRows(s: SessionSummary): ReportRow[] {
  return [
    { label: "Exercise", value: exerciseName(s.exercise) },
    { label: "Date", value: formatDate(s.startedAt) },
    { label: "Time exercising", value: formatDuration(s.durationSec) },
    { label: "Reps", value: String(s.reps) },
    { label: "Average range of motion", value: s.reps > 0 ? formatDeg(s.avgRomDeg) : "n/a" },
    { label: "Average time per rep", value: s.reps > 0 ? formatSec(s.avgTempoSec) : "n/a" },
    { label: "Reps with full range", value: `${s.fullRangeReps} of ${s.reps}` },
    { label: "Reps that were too fast", value: `${s.tooFastReps} of ${s.reps}` },
  ];
}

/** Plain text, for copying into a message. */
export function reportText(sessions: readonly SessionSummary[]): string {
  const blocks = sessions.map((s) =>
    sessionRows(s)
      .map((r) => `${r.label}: ${r.value}`)
      .join("\n"),
  );
  return [...blocks, REPORT_NOTE].join("\n\n");
}
