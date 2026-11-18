// Owner: Yadnesh.
//
// FROZEN CONTRACT: Sample, GestureEvent and Detector must not change without
// agreement from all three owners (Yadnesh, Viviana, Anish). See .kiro/steering/protocol.md.

export const PROTOCOL_VERSION = 1;

/**
 * One sensor reading from a phone.
 * Units: acceleration m/s² (including gravity), rotation rate deg/s,
 * orientation degrees, t in ms, rms 0..1 (mic loudness computed on the phone).
 */
export type Sample = {
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  alpha: number;
  beta: number;
  gamma: number;
  rms?: number;
};

/** A detected gesture. t is in ms, on the same clock as the samples that produced it. */
export type GestureEvent = {
  name: string;
  t: number;
  data?: Record<string, number>;
};

/** A pure gesture detector. No browser APIs, so it runs on the phone and in tests. */
export interface Detector<Config> {
  name: string;
  defaults: Config;
  create(config: Config): {
    push(s: Sample): GestureEvent[];
    reset(): void;
  };
}
