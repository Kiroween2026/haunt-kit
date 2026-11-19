// Owner: Yadnesh. Collects samples and hands out batches for sensor_frames messages.

import { MAX_SAMPLES_PER_BATCH, type Sample } from "@haunt-kit/protocol";

export const SAMPLE_HZ = 30;
export const FLUSH_MS = 100;

export class FrameBatcher {
  private buffer: Sample[] = [];
  private lastFlush: number | null = null;

  constructor(
    private readonly flushMs = FLUSH_MS,
    private readonly max = MAX_SAMPLES_PER_BATCH,
  ) {}

  /** Adds a sample. Returns a batch when it's time to send one, else null. */
  push(sample: Sample, now: number): Sample[] | null {
    this.buffer.push(sample);
    this.lastFlush ??= now;
    if (this.buffer.length >= this.max || now - this.lastFlush >= this.flushMs) return this.flush(now);
    return null;
  }

  /** Returns everything buffered (or null if empty). */
  flush(now: number): Sample[] | null {
    this.lastFlush = now;
    if (this.buffer.length === 0) return null;
    const batch = this.buffer;
    this.buffer = [];
    return batch;
  }

  clear(): void {
    this.buffer = [];
    this.lastFlush = null;
  }
}
