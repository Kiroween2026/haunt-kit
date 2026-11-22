import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RECORDING_OS,
  RecordingMetaSchema,
  RecordingSchema,
  recordingMetaSchema,
  recordingSchema,
  type GhostRecording,
  type RecordingMeta,
} from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recordingsDir = fs.existsSync(path.resolve(__dirname, "../../../../recordings"))
  ? path.resolve(__dirname, "../../../../recordings")
  : path.resolve(process.cwd(), "recordings");

const sampleValidMeta: RecordingMeta = {
  label: "test-recording",
  os: "Android",
  browser: "Chrome",
  sampleRateHz: 60,
  recordedAt: "2026-11-17T17:47:51.372Z",
};

const sampleValidSample = {
  t: 0,
  ax: 0,
  ay: 0,
  az: 9.81,
  gx: 0,
  gy: 0,
  gz: 0,
  alpha: 90,
  beta: 0,
  gamma: 0,
  rms: 0.05,
};

describe("recordingMetaSchema", () => {
  it("accepts valid metadata for all supported OS types", () => {
    for (const os of RECORDING_OS) {
      const result = recordingMetaSchema.safeParse({
        ...sampleValidMeta,
        os,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts ISO 8601 timestamps with timezone offsets", () => {
    const result = recordingMetaSchema.safeParse({
      ...sampleValidMeta,
      recordedAt: "2026-11-17T23:17:51.372+05:30",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported OS types", () => {
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, os: "Windows" }).success).toBe(false);
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, os: "android" }).success).toBe(false);
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, os: "iOS-Simulator" }).success).toBe(false);
  });

  it("rejects empty labels and blank browsers", () => {
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, label: "" }).success).toBe(false);
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, browser: "" }).success).toBe(false);
  });

  it("rejects zero or negative sampleRateHz", () => {
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, sampleRateHz: 0 }).success).toBe(false);
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, sampleRateHz: -60 }).success).toBe(false);
  });

  it("rejects invalid ISO 8601 timestamps", () => {
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, recordedAt: "not-a-date" }).success).toBe(
      false,
    );
    expect(
      recordingMetaSchema.safeParse({ ...sampleValidMeta, recordedAt: "2026/11/17 17:47:51" }).success,
    ).toBe(false);
    expect(recordingMetaSchema.safeParse({ ...sampleValidMeta, recordedAt: "2026-11-17" }).success).toBe(
      false,
    );
  });

  it("exports PascalCase alias RecordingMetaSchema", () => {
    expect(RecordingMetaSchema).toBe(recordingMetaSchema);
  });
});

describe("recordingSchema", () => {
  it("accepts valid ghost recordings with samples", () => {
    const validRecording: GhostRecording = {
      meta: sampleValidMeta,
      samples: [sampleValidSample, { ...sampleValidSample, t: 16, az: 9.85, rms: undefined }],
    };

    const parsed = recordingSchema.parse(validRecording);
    expect(parsed.meta.label).toBe("test-recording");
    expect(parsed.samples).toHaveLength(2);
  });

  it("rejects samples missing required fields", () => {
    const badSample = {
      t: 0,
      ax: 0,
      // missing ay, az, gx, gy, gz, alpha, beta, gamma
    };

    expect(
      recordingSchema.safeParse({
        meta: sampleValidMeta,
        samples: [badSample],
      }).success,
    ).toBe(false);
  });

  it("rejects samples with non-finite coordinates", () => {
    expect(
      recordingSchema.safeParse({
        meta: sampleValidMeta,
        samples: [{ ...sampleValidSample, az: Number.NaN }],
      }).success,
    ).toBe(false);

    expect(
      recordingSchema.safeParse({
        meta: sampleValidMeta,
        samples: [{ ...sampleValidSample, ax: Number.POSITIVE_INFINITY }],
      }).success,
    ).toBe(false);
  });

  it("rejects samples with rms outside 0..1 range", () => {
    expect(
      recordingSchema.safeParse({
        meta: sampleValidMeta,
        samples: [{ ...sampleValidSample, rms: 1.05 }],
      }).success,
    ).toBe(false);

    expect(
      recordingSchema.safeParse({
        meta: sampleValidMeta,
        samples: [{ ...sampleValidSample, rms: -0.1 }],
      }).success,
    ).toBe(false);
  });

  it("exports PascalCase alias RecordingSchema", () => {
    expect(RecordingSchema).toBe(recordingSchema);
  });
});

describe("real Android recordings in recordings/", () => {
  it("finds all 6 real Android recording files", () => {
    const files = fs.readdirSync(recordingsDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(6);
  });

  it("successfully validates all 6 real recordings against recordingSchema", () => {
    const files = fs.readdirSync(recordingsDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const fullPath = path.join(recordingsDir, file);
      const raw = fs.readFileSync(fullPath, "utf8");
      const json = JSON.parse(raw);

      const parsed = recordingSchema.parse(json);

      expect(parsed.meta.os).toBe("Android");
      expect(parsed.meta.browser).toBe("Chrome");
      expect(parsed.meta.sampleRateHz).toBeGreaterThanOrEqual(50);
      expect(parsed.samples.length).toBeGreaterThanOrEqual(300);

      // Verify sample monotonicity and non-negative timestamps
      let lastT = -1;
      for (const sample of parsed.samples) {
        expect(sample.t).toBeGreaterThanOrEqual(0);
        expect(sample.t).toBeGreaterThanOrEqual(lastT);
        lastT = sample.t;
      }
    }
  });
});
