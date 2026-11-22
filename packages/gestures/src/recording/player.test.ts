import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayPlayer } from "./player";
import { recordingSchema, type GhostRecording, type Sample } from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recordingsDir = fs.existsSync(path.resolve(__dirname, "../../../../recordings"))
  ? path.resolve(__dirname, "../../../../recordings")
  : path.resolve(process.cwd(), "recordings");

function makeTestSample(t: number, ax = 0, ay = 0, az = 9.81): Sample {
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
    rms: 0.1,
  };
}

const mockRecording: GhostRecording = {
  meta: {
    label: "player-test-mock",
    os: "Android",
    browser: "Chrome",
    sampleRateHz: 60,
    recordedAt: "2026-11-17T17:47:51.372Z",
  },
  samples: [
    makeTestSample(0, 0.1, 0.2, 9.8),
    makeTestSample(20, 0.3, 0.4, 9.9),
    makeTestSample(50, 0.5, 0.6, 10.0),
    makeTestSample(100, 0.7, 0.8, 10.1),
  ],
};

const emptyRecording: GhostRecording = {
  meta: {
    label: "empty",
    os: "Synthetic",
    browser: "Test",
    sampleRateHz: 60,
    recordedAt: "2026-11-17T17:47:51.372Z",
  },
  samples: [],
};

describe("ReplayPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Properties and getters", () => {
    it("exposes metadata, samples, sampleCount, and durationMs correctly", () => {
      const player = new ReplayPlayer(mockRecording);
      expect(player.meta.label).toBe("player-test-mock");
      expect(player.meta.os).toBe("Android");
      expect(player.sampleCount).toBe(4);
      expect(player.durationMs).toBe(100);
      expect(player.samples).toHaveLength(4);
      expect(player.isPlaying).toBe(false);
    });

    it("handles durationMs for empty or single-sample recordings", () => {
      const emptyPlayer = new ReplayPlayer(emptyRecording);
      expect(emptyPlayer.durationMs).toBe(0);
      expect(emptyPlayer.sampleCount).toBe(0);

      const singlePlayer = new ReplayPlayer({
        ...mockRecording,
        samples: [makeTestSample(50)],
      });
      expect(singlePlayer.durationMs).toBe(0);
      expect(singlePlayer.sampleCount).toBe(1);
    });
  });

  describe("playImmediate()", () => {
    it("delivers all samples synchronously in order and preserves sample fidelity", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];

      player.playImmediate((sample) => {
        received.push(sample);
      });

      expect(received).toHaveLength(4);
      expect(received[0]!.t).toBe(0);
      expect(received[1]!.t).toBe(20);
      expect(received[2]!.t).toBe(50);
      expect(received[3]!.t).toBe(100);
      expect(received[0]!.az).toBeCloseTo(9.8);
      expect(received[3]!.az).toBeCloseTo(10.1);
      expect(player.isPlaying).toBe(false);
    });

    it("does not call onSample on empty recordings", () => {
      const player = new ReplayPlayer(emptyRecording);
      const onSample = vi.fn();

      player.playImmediate(onSample);
      expect(onSample).not.toHaveBeenCalled();
    });
  });

  describe("playRealtime()", () => {
    it("delivers samples according to elapsed timestamps and calls onComplete", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];
      const onComplete = vi.fn();

      player.playRealtime({
        onSample: (s) => received.push(s),
        onComplete,
      });

      expect(player.isPlaying).toBe(true);

      // t = 0: first sample delivered immediately
      vi.advanceTimersByTime(0);
      expect(received).toHaveLength(1);
      expect(received[0]!.t).toBe(0);
      expect(onComplete).not.toHaveBeenCalled();

      // Advance by 19ms: second sample (at t=20) not delivered yet
      vi.advanceTimersByTime(19);
      expect(received).toHaveLength(1);

      // Advance by 1ms (total 20ms): second sample delivered
      vi.advanceTimersByTime(1);
      expect(received).toHaveLength(2);
      expect(received[1]!.t).toBe(20);

      // Advance by 30ms (total 50ms): third sample delivered
      vi.advanceTimersByTime(30);
      expect(received).toHaveLength(3);
      expect(received[2]!.t).toBe(50);

      // Advance by 50ms (total 100ms): fourth sample delivered and finished
      vi.advanceTimersByTime(50);
      expect(received).toHaveLength(4);
      expect(received[3]!.t).toBe(100);
      expect(player.isPlaying).toBe(false);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("supports 2.0x speed multiplier (halves elapsed intervals)", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];
      const onComplete = vi.fn();

      player.playRealtime({
        onSample: (s) => received.push(s),
        onComplete,
        speed: 2.0,
      });

      // t=0
      vi.advanceTimersByTime(0);
      expect(received).toHaveLength(1);

      // At 2x speed, sample 2 (delta 20ms) fires after 10ms
      vi.advanceTimersByTime(10);
      expect(received).toHaveLength(2);

      // Sample 3 (delta 30ms) fires after 15ms more (total 25ms)
      vi.advanceTimersByTime(15);
      expect(received).toHaveLength(3);

      // Sample 4 (delta 50ms) fires after 25ms more (total 50ms)
      vi.advanceTimersByTime(25);
      expect(received).toHaveLength(4);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(player.isPlaying).toBe(false);
    });

    it("supports 0.5x speed multiplier (doubles elapsed intervals)", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];
      const onComplete = vi.fn();

      player.playRealtime({
        onSample: (s) => received.push(s),
        onComplete,
        speed: 0.5,
      });

      // t=0
      vi.advanceTimersByTime(0);
      expect(received).toHaveLength(1);

      // At 0.5x speed, sample 2 (delta 20ms) fires after 40ms
      vi.advanceTimersByTime(39);
      expect(received).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(received).toHaveLength(2);

      // Sample 3 (delta 30ms) fires after 60ms more (total 100ms)
      vi.advanceTimersByTime(60);
      expect(received).toHaveLength(3);

      // Sample 4 (delta 50ms) fires after 100ms more (total 200ms)
      vi.advanceTimersByTime(100);
      expect(received).toHaveLength(4);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("falls back to 1.0x speed when invalid speed multipliers are provided", () => {
      const invalidSpeeds = [0, -2, Number.NaN, Number.POSITIVE_INFINITY, undefined];

      for (const invalidSpeed of invalidSpeeds) {
        const player = new ReplayPlayer(mockRecording);
        const received: Sample[] = [];

        player.playRealtime({
          onSample: (s) => received.push(s),
          speed: invalidSpeed,
        });

        vi.advanceTimersByTime(0);
        expect(received).toHaveLength(1);

        // At fallback 1.0x speed, sample 2 fires at 20ms
        vi.advanceTimersByTime(19);
        expect(received).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(received).toHaveLength(2);

        player.stop();
      }
    });

    it("supports loop mode continuously without calling onComplete", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];
      const onComplete = vi.fn();

      player.playRealtime({
        onSample: (s) => received.push(s),
        onComplete,
        loop: true,
      });

      // Play through round 1 (100ms)
      vi.advanceTimersByTime(100);
      expect(received).toHaveLength(4);
      expect(onComplete).not.toHaveBeenCalled();
      expect(player.isPlaying).toBe(true);

      // Loop round 2 starts
      vi.advanceTimersByTime(1);
      expect(received).toHaveLength(5);
      expect(received[4]!.t).toBe(0);

      // Advance through round 2 (100ms)
      vi.advanceTimersByTime(100);
      expect(received).toHaveLength(8);
      expect(onComplete).not.toHaveBeenCalled();
      expect(player.isPlaying).toBe(true);

      player.stop();
      expect(player.isPlaying).toBe(false);
    });

    it("handles empty recordings safely in playRealtime", () => {
      const player = new ReplayPlayer(emptyRecording);
      const onSample = vi.fn();
      const onComplete = vi.fn();

      const stop = player.playRealtime({
        onSample,
        onComplete,
      });

      expect(player.isPlaying).toBe(false);
      expect(onSample).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(typeof stop).toBe("function");
    });
  });

  describe("stop() and cancellation", () => {
    it("stops playback immediately, cancels active timer, and does not fire onComplete", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];
      const onComplete = vi.fn();

      player.playRealtime({
        onSample: (s) => received.push(s),
        onComplete,
      });

      vi.advanceTimersByTime(20);
      expect(received).toHaveLength(2);
      expect(player.isPlaying).toBe(true);

      player.stop();
      expect(player.isPlaying).toBe(false);

      // Advancing timer further should deliver zero additional samples
      vi.advanceTimersByTime(200);
      expect(received).toHaveLength(2);
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("returned stop function cancels playback", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];

      const stop = player.playRealtime({
        onSample: (s) => received.push(s),
      });

      vi.advanceTimersByTime(0);
      expect(received).toHaveLength(1);

      stop();
      expect(player.isPlaying).toBe(false);

      vi.advanceTimersByTime(500);
      expect(received).toHaveLength(1);
    });

    it("allows stopping inside the onSample callback without errors", () => {
      const player = new ReplayPlayer(mockRecording);
      const received: Sample[] = [];
      const onComplete = vi.fn();

      player.playRealtime({
        onSample: (s) => {
          received.push(s);
          if (s.t === 20) {
            player.stop();
          }
        },
        onComplete,
      });

      vi.advanceTimersByTime(100);
      expect(received).toHaveLength(2);
      expect(player.isPlaying).toBe(false);
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("restarting playback clears any running timer from the previous playback", () => {
      const player = new ReplayPlayer(mockRecording);
      const run1Received: Sample[] = [];
      const run2Received: Sample[] = [];

      player.playRealtime({
        onSample: (s) => run1Received.push(s),
      });

      vi.advanceTimersByTime(20);
      expect(run1Received).toHaveLength(2);

      // Start second playback without manually calling stop first
      player.playRealtime({
        onSample: (s) => run2Received.push(s),
      });

      // Only run2 should receive new samples now
      vi.advanceTimersByTime(100);
      expect(run1Received).toHaveLength(2);
      expect(run2Received).toHaveLength(4);
    });
  });

  describe("Integration with real Android recordings", () => {
    it("can synchronously play all 301 samples from a real Android recording", () => {
      const filePath = path.join(recordingsDir, "ghost-recording-table-flat-2026-11-17T17-28-41-306Z.json");
      const raw = fs.readFileSync(filePath, "utf8");
      const recording = recordingSchema.parse(JSON.parse(raw));

      const player = new ReplayPlayer(recording);
      expect(player.sampleCount).toBe(301);
      expect(player.durationMs).toBe(4984);

      const received: Sample[] = [];
      player.playImmediate((s) => received.push(s));

      expect(received).toHaveLength(301);
      expect(received[0]!.t).toBe(14);
      expect(received[300]!.t).toBe(4998);
      expect(received[0]!.az).toBeCloseTo(9.8);
    });

    it("can play a real Android recording in real-time through fake timers", () => {
      const filePath = path.join(
        recordingsDir,
        "ghost-recording-android-left-right-2026-11-17T17-47-51-393Z.json",
      );
      const raw = fs.readFileSync(filePath, "utf8");
      const recording = recordingSchema.parse(JSON.parse(raw));

      const player = new ReplayPlayer(recording);
      const received: Sample[] = [];
      const onComplete = vi.fn();

      player.playRealtime({
        onSample: (s) => received.push(s),
        onComplete,
        speed: 2.0, // 2x speed: 4980ms takes 2490ms
      });

      expect(player.isPlaying).toBe(true);

      // Fast-forward to the end of 2x playback
      vi.advanceTimersByTime(2500);

      expect(received).toHaveLength(300);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(player.isPlaying).toBe(false);
    });
  });
});
