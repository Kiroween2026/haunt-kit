// Owner: Anish (built by Yadnesh while Anish is unavailable).
// What one exercise session looked like. This is what we save and what the therapist report shows.
import { z } from "zod";

export const repRecordSchema = z.object({
  count: z.number().int().min(1),
  romDeg: z.number().min(0).max(360),
  tempoSec: z.number().min(0).max(600),
  fullRange: z.boolean(),
  tooFast: z.boolean(),
});

export const summarySchema = z.object({
  id: z.string().min(1).max(64),
  exercise: z.enum(["shoulder-raise", "bicep-curl"]),
  /** ISO 8601 time the session started. */
  startedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a date"),
  durationSec: z.number().min(0),
  reps: z.number().int().min(0),
  avgRomDeg: z.number().min(0).max(360),
  avgTempoSec: z.number().min(0),
  fullRangeReps: z.number().int().min(0),
  tooFastReps: z.number().int().min(0),
  detail: z.array(repRecordSchema),
});

export type RepRecord = z.infer<typeof repRecordSchema>;
export type SessionSummary = z.infer<typeof summarySchema>;

export const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export function summarize(args: {
  id: string;
  exercise: SessionSummary["exercise"];
  startedAt: string;
  durationSec: number;
  detail: readonly RepRecord[];
}): SessionSummary {
  const { detail } = args;
  return {
    id: args.id,
    exercise: args.exercise,
    startedAt: args.startedAt,
    durationSec: Math.max(0, args.durationSec),
    reps: detail.length,
    avgRomDeg: mean(detail.map((r) => r.romDeg)),
    avgTempoSec: mean(detail.map((r) => r.tempoSec)),
    fullRangeReps: detail.filter((r) => r.fullRange).length,
    tooFastReps: detail.filter((r) => r.tooFast).length,
    detail: [...detail],
  };
}

/** True if the numbers in a summary agree with each other. */
export function isConsistent(s: SessionSummary): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return (
    s.reps === s.detail.length &&
    s.fullRangeReps === s.detail.filter((r) => r.fullRange).length &&
    s.tooFastReps === s.detail.filter((r) => r.tooFast).length &&
    s.fullRangeReps <= s.reps &&
    s.tooFastReps <= s.reps &&
    close(s.avgRomDeg, mean(s.detail.map((r) => r.romDeg))) &&
    close(s.avgTempoSec, mean(s.detail.map((r) => r.tempoSec))) &&
    s.detail.every((r, i) => r.count === i + 1)
  );
}
