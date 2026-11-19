// Owner: Yadnesh. Mic loudness. Computed on the phone; only this number is ever sent.

/** Root mean square of audio samples in -1..1, clamped to 0..1. */
export function rmsOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    if (Number.isFinite(v)) sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length));
}
