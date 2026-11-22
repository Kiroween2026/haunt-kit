// Owner: Anish. Replay player for Ghost Recordings.
// Supports synchronous immediate replay for unit tests and sequential real-time replay with speed multipliers.
// Uses standard setTimeout/clearTimeout only (no browser/DOM APIs).

import type { Sample } from "@haunt-kit/protocol";
import type { GhostRecording, RecordingMeta } from "./schema";

export interface PlayRealtimeOptions {
  /** Callback invoked as each sample is delivered */
  onSample: (sample: Sample) => void;
  /** Callback invoked when all samples have finished playing (not called if stopped) */
  onComplete?: () => void;
  /** Playback speed multiplier (e.g. 0.5 for half speed, 2.0 for 2x). Defaults to 1.0 */
  speed?: number;
  /** Whether to loop playback continuously. Defaults to false */
  loop?: boolean;
}

export class ReplayPlayer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _isPlaying = false;

  constructor(private readonly recording: GhostRecording) {}

  /** Metadata of the loaded recording */
  get meta(): RecordingMeta {
    return this.recording.meta;
  }

  /** Samples contained in the loaded recording */
  get samples(): readonly Sample[] {
    return this.recording.samples;
  }

  /** Total number of samples in the recording */
  get sampleCount(): number {
    return this.recording.samples.length;
  }

  /** Total duration in milliseconds between the first and last sample */
  get durationMs(): number {
    const samples = this.recording.samples;
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last || samples.length < 2) return 0;
    return Math.max(0, last.t - first.t);
  }

  /** Whether real-time playback is currently active */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Synchronous immediate playback: delivers every sample in order in a single tick.
   * Preserves exact sample data and does not modify timestamps.
   * Ideal for fast automated testing and detector validation.
   */
  playImmediate(onSample: (sample: Sample) => void): void {
    for (const sample of this.recording.samples) {
      onSample(sample);
    }
  }

  /**
   * Real-time playback: schedules samples sequentially according to their elapsed timestamps.
   * Uses sequential scheduling (one active timer at a time) rather than scheduling thousands of timers upfront.
   * Returns a cleanup function that stops playback when called.
   */
  playRealtime(options: PlayRealtimeOptions): () => void {
    // Cancel any previous playback to avoid overlapping timers
    this.stop();

    const samples = this.recording.samples;
    const { onSample, onComplete, speed, loop = false } = options;

    if (samples.length === 0) {
      onComplete?.();
      return () => {};
    }

    // Sanitize speed multiplier: must be positive finite number, otherwise fallback to 1.0
    const effectiveSpeed = typeof speed === "number" && Number.isFinite(speed) && speed > 0 ? speed : 1.0;

    this._isPlaying = true;
    let currentIndex = 0;

    const step = () => {
      if (!this._isPlaying) return;

      const currentSample = samples[currentIndex];
      if (!currentSample) {
        this.stop();
        return;
      }

      onSample(currentSample);

      // Check if onSample callback stopped playback
      if (!this._isPlaying) return;

      // Check if we reached the end of the recording
      if (currentIndex >= samples.length - 1) {
        if (loop) {
          currentIndex = 0;
          this.timer = setTimeout(step, 0);
        } else {
          this._isPlaying = false;
          this.timer = null;
          onComplete?.();
        }
        return;
      }

      // Schedule next sample sequentially based on timestamp difference
      const nextSample = samples[currentIndex + 1];
      if (!nextSample) {
        this._isPlaying = false;
        this.timer = null;
        onComplete?.();
        return;
      }

      const deltaMs = Math.max(0, (nextSample.t - currentSample.t) / effectiveSpeed);
      currentIndex++;

      this.timer = setTimeout(step, deltaMs);
    };

    // Begin with the first sample
    this.timer = setTimeout(step, 0);

    return () => this.stop();
  }

  /**
   * Halts active playback immediately, cancelling any scheduled timer.
   * Prevents further sample delivery and resets isPlaying to false.
   */
  stop(): void {
    this._isPlaying = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
