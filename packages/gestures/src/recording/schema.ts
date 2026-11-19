// Owner: Anish. Zod validation schema for Ghost Recordings.
// Uses the frozen Sample type and sampleSchema from @haunt-kit/protocol directly.

import { sampleSchema, type Sample } from "@haunt-kit/protocol";
import { z } from "zod";

/**
 * Valid operating systems for ghost recordings.
 * Covers authentic mobile captures (Android, iOS), desktop simulation,
 * and synthetic mathematical test vectors.
 */
export const RECORDING_OS = ["Android", "iOS", "Desktop", "Synthetic"] as const;
export type RecordingOS = (typeof RECORDING_OS)[number];

/**
 * Metadata describing recording origin, environment, and sampling frequency.
 */
export const recordingMetaSchema = z.object({
  label: z.string().min(1, "label must not be empty"),
  os: z.enum(RECORDING_OS),
  browser: z.string().min(1, "browser must not be empty"),
  sampleRateHz: z.number().positive("sampleRateHz must be a positive number"),
  recordedAt: z.string().datetime({ offset: true, message: "recordedAt must be a valid ISO 8601 timestamp" }),
});

/**
 * Full schema for a Ghost Recording JSON file.
 * Contains metadata and an array of valid protocol Samples.
 */
export const recordingSchema = z.object({
  meta: recordingMetaSchema,
  samples: z.array(sampleSchema),
});

// PascalCase aliases matching design specs
export const RecordingMetaSchema = recordingMetaSchema;
export const RecordingSchema = recordingSchema;

// Inferred TypeScript types
export type RecordingMeta = z.infer<typeof recordingMetaSchema>;
export type GhostRecording = z.infer<typeof recordingSchema>;

// Re-export protocol Sample and sampleSchema for consumer convenience
export type { Sample };
export { sampleSchema };
