import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGhostPlayer } from "./adapter";
import { recordingSchema, type GhostRecording, type Sample } from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recordingsDir = fs.existsSync(path.resolve(__dirname, "../../../../recordings"))
  ? path.resolve(__dirname, "../../../../recordings")
  : path.resolve(process.cwd(), "recordings");

function makeSample(t: number, ax = 0, ay = 0, az = 9.81): Sample {
  return {
    t,
    ax,
    ay,
    az,
    gx: 0,
    gy: 0,
    gz: 0,
    alpha: 90,
    beta: 0,
    gamma: 0,
    rms: 0.05,
  };
}

const mockRecording: GhostRecording = {
  meta: {
    label: "adapter-mock",
    os: "Android",
    browser: "Chrome",
    sampleRateHz: 60,
    recordedAt: "2026-11-17T17:47:51.372Z",
  },
  samples: [makeSample(0, 0.1, 0.2, 9.8), makeSample(25, 0.3, 0.4, 9.9), makeSample(60, 0.5, 0.6, 10.0)],
};

describe("GhostPlayerAdapter (createGhostPlayer)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes player identity properties and initial isPlaying state", () => {
    const adapter = createGhostPlayer("bot-casper", "Casper the Ghost", mockRecording);

    expect(adapter.id).toBe("bot-casper");
    expect(adapter.name).toBe("Casper the Ghost");
    expect(adapter.isPlaying).toBe(false);
  });

  it("delivers samples in real-time and calls onComplete when finished", () => {
    const adapter = createGhostPlayer("bot-1", "Player One", mockRecording);
    const received: Sample[] = [];
    const onComplete = vi.fn();

    adapter.start((s) => received.push(s), onComplete);
    expect(adapter.isPlaying).toBe(true);

    // t=0: first sample delivered
    vi.advanceTimersByTime(0);
    expect(received).toHaveLength(1);
    expect(received[0]!.t).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();

    // t=25: second sample delivered
    vi.advanceTimersByTime(25);
    expect(received).toHaveLength(2);
    expect(received[1]!.t).toBe(25);

    // t=60: third sample delivered and finished
    vi.advanceTimersByTime(35);
    expect(received).toHaveLength(3);
    expect(received[2]!.t).toBe(60);
    expect(adapter.isPlaying).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("supports stop() to halt playback and prevent further sample delivery", () => {
    const adapter = createGhostPlayer("bot-stop", "Stopping Player", mockRecording);
    const received: Sample[] = [];
    const onComplete = vi.fn();

    adapter.start((s) => received.push(s), onComplete);

    vi.advanceTimersByTime(25);
    expect(received).toHaveLength(2);
    expect(adapter.isPlaying).toBe(true);

    adapter.stop();
    expect(adapter.isPlaying).toBe(false);

    // Advance further: no new samples and onComplete not called
    vi.advanceTimersByTime(100);
    expect(received).toHaveLength(2);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("honors speed option (e.g. 2.0x playback speed)", () => {
    const adapter = createGhostPlayer("bot-fast", "Speedy Ghost", mockRecording, {
      speed: 2.0,
    });
    const received: Sample[] = [];
    const onComplete = vi.fn();

    adapter.start((s) => received.push(s), onComplete);

    vi.advanceTimersByTime(0);
    expect(received).toHaveLength(1);

    // At 2x speed, sample at t=25 arrives after 12.5ms (13ms)
    vi.advanceTimersByTime(13);
    expect(received).toHaveLength(2);

    // Final sample at t=60 arrives after (60-25)/2 = 17.5ms (18ms total additional)
    vi.advanceTimersByTime(18);
    expect(received).toHaveLength(3);
    expect(adapter.isPlaying).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("honors loop option continuously without calling onComplete", () => {
    const adapter = createGhostPlayer("bot-loop", "Looping Ghost", mockRecording, {
      loop: true,
    });
    const received: Sample[] = [];
    const onComplete = vi.fn();

    adapter.start((s) => received.push(s), onComplete);

    // Complete round 1 (60ms)
    vi.advanceTimersByTime(60);
    expect(received).toHaveLength(3);
    expect(onComplete).not.toHaveBeenCalled();
    expect(adapter.isPlaying).toBe(true);

    // Round 2 starts
    vi.advanceTimersByTime(1);
    expect(received).toHaveLength(4);
    expect(received[3]!.t).toBe(0);

    adapter.stop();
    expect(adapter.isPlaying).toBe(false);
  });

  it("integrates seamlessly with a real Android recording from recordings/", () => {
    const filePath = path.join(recordingsDir, "ghost-recording-android-slide-2026-11-17T17-53-27-552Z.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const recording = recordingSchema.parse(JSON.parse(raw));

    const adapter = createGhostPlayer("ghost-slider", "Android Slider Bot", recording, { speed: 2.0 });

    expect(adapter.id).toBe("ghost-slider");
    expect(adapter.name).toBe("Android Slider Bot");

    const received: Sample[] = [];
    const onComplete = vi.fn();

    adapter.start((s) => received.push(s), onComplete);
    expect(adapter.isPlaying).toBe(true);

    // At 2x speed, ~4985ms takes ~2493ms
    vi.advanceTimersByTime(2500);

    expect(received).toHaveLength(300);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(adapter.isPlaying).toBe(false);
  });
});
