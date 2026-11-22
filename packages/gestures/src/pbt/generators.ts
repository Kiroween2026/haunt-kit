import fc from "fast-check";
import type { Sample } from "@haunt-kit/protocol";

export type Matrix3x3 = [[number, number, number], [number, number, number], [number, number, number]];

/**
 * Multiplies a 3x3 matrix by a 3D vector.
 */
export function rotateVector(R: Matrix3x3, v: [number, number, number]): [number, number, number] {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
}

/**
 * Rotates all acceleration vectors in a sample stream by a 3x3 SO(3) matrix.
 */
export function rotateSampleStream(stream: readonly Sample[], R: Matrix3x3): Sample[] {
  return stream.map((s) => {
    const [rax, ray, raz] = rotateVector(R, [s.ax, s.ay, s.az]);
    return {
      ...s,
      ax: rax,
      ay: ray,
      az: raz,
    };
  });
}

/**
 * Fast-check arbitrary for generating valid 3D rotation matrices in SO(3).
 * Generated via normalized unit quaternions q = (w, x, y, z), ensuring
 * R^T R = I and det(R) = +1 within floating point precision.
 */
export const so3RotationArb: fc.Arbitrary<Matrix3x3> = fc
  .tuple(
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
  )
  .filter(([w, x, y, z]) => w * w + x * x + y * y + z * z > 0.01)
  .map(([w, x, y, z]) => {
    const norm = Math.hypot(w, x, y, z);
    const qw = w / norm;
    const qx = x / norm;
    const qy = y / norm;
    const qz = z / norm;

    const r00 = 1 - 2 * (qy * qy + qz * qz);
    const r01 = 2 * (qx * qy - qz * qw);
    const r02 = 2 * (qx * qz + qy * qw);

    const r10 = 2 * (qx * qy + qz * qw);
    const r11 = 1 - 2 * (qx * qx + qz * qz);
    const r12 = 2 * (qy * qz - qx * qw);

    const r20 = 2 * (qx * qz - qy * qw);
    const r21 = 2 * (qy * qz + qx * qw);
    const r22 = 1 - 2 * (qx * qx + qy * qy);

    return [
      [r00, r01, r02],
      [r10, r11, r12],
      [r20, r21, r22],
    ];
  });

/**
 * Generates a stream of samples representing a stationary phone with realistic noise.
 * Specification Invariant 1 (§4.1):
 * |a - 9.81| < 0.2 m/s², |omega| < 2.0 deg/s.
 */
export function stillStreamGen(options?: {
  sampleRateHz?: number;
  durationMs?: number;
}): fc.Arbitrary<Sample[]> {
  const rateHz = options?.sampleRateHz ?? 60;
  const duration = options?.durationMs ?? 2000;
  const dtMs = 1000 / rateHz;
  const count = Math.max(10, Math.floor(duration / dtMs));

  return fc
    .tuple(
      // Orientation angles
      fc.double({ min: 0, max: 360, noNaN: true }),
      fc.double({ min: -30, max: 30, noNaN: true }),
      fc.double({ min: -30, max: 30, noNaN: true }),
      // Noise variations per sample: acceleration magnitude noise < 0.18 m/s²
      fc.array(
        fc.tuple(
          fc.double({ min: -0.09, max: 0.09, noNaN: true }),
          fc.double({ min: -0.09, max: 0.09, noNaN: true }),
          fc.double({ min: -0.09, max: 0.09, noNaN: true }),
          fc.double({ min: -0.8, max: 0.8, noNaN: true }),
          fc.double({ min: -0.8, max: 0.8, noNaN: true }),
          fc.double({ min: -0.8, max: 0.8, noNaN: true }),
        ),
        { minLength: count, maxLength: count },
      ),
    )
    .map(([alpha0, beta0, gamma0, noiseSamples]) => {
      // Resting orientation gravity vector
      const bRad = (beta0 * Math.PI) / 180;
      const gRad = (gamma0 * Math.PI) / 180;
      const baseAx = 9.81 * Math.sin(gRad);
      const baseAy = -9.81 * Math.sin(bRad) * Math.cos(gRad);
      const baseAz = 9.81 * Math.cos(bRad) * Math.cos(gRad);

      return noiseSamples.map(([nax, nay, naz, ngx, ngy, ngz], i) => {
        const t = Math.round(i * dtMs);
        const ax = baseAx + nax;
        const ay = baseAy + nay;
        const az = baseAz + naz;

        return {
          t,
          ax,
          ay,
          az,
          gx: ngx,
          gy: ngy,
          gz: ngz,
          alpha: alpha0,
          beta: beta0,
          gamma: gamma0,
          rms: 0.05,
        };
      });
    });
}

/**
 * Continuous trajectory representation for sample-rate invariance.
 * Given time t (ms), returns continuous sensor state (ax, ay, az, gx, gy, gz, beta, gamma).
 */
export interface ContinuousTrajectory {
  durationMs: number;
  sampleAt(t: number): {
    ax: number;
    ay: number;
    az: number;
    gx: number;
    gy: number;
    gz: number;
    beta: number;
    gamma: number;
  };
}

/**
 * Physical shake trajectory configuration.
 */
export interface ShakeTrajectoryConfig {
  burstCount: number;
  burstDurationMs: number;
  restDurationMs: number;
  freqHz: number;
  peakAcc: number;
}

/**
 * Creates a continuous shake trajectory consisting of burstCount distinct
 * vigorous shaking motions separated by resting intervals > cooldownMs.
 */
export function createContinuousShakeTrajectory(config: ShakeTrajectoryConfig): ContinuousTrajectory {
  const { burstCount, burstDurationMs, restDurationMs, freqHz, peakAcc } = config;
  const cycleDuration = burstDurationMs + restDurationMs;
  const totalDuration = burstCount * cycleDuration;

  return {
    durationMs: totalDuration,
    sampleAt(t: number) {
      const cycleIndex = Math.floor(t / cycleDuration);
      if (cycleIndex >= burstCount) {
        return {
          ax: 0,
          ay: 0,
          az: 9.81,
          gx: 0,
          gy: 0,
          gz: 0,
          beta: 0,
          gamma: 0,
        };
      }

      const cycleTime = t % cycleDuration;
      const omega = 2 * Math.PI * freqHz;
      const offset = cycleTime < burstDurationMs ? peakAcc * Math.sin(omega * (cycleTime / 1000)) : 0;

      return {
        ax: offset,
        ay: offset * 0.5,
        az: 9.81 + offset * 0.2,
        gx: 0,
        gy: 0,
        gz: 0,
        beta: 0,
        gamma: 0,
      };
    },
  };
}

/**
 * Generates realistic physical shake trajectories with distinct shake bursts
 * separated by rest intervals > cooldownMs (400 ms).
 */
export const shakingTrajectoryArb: fc.Arbitrary<ContinuousTrajectory> = fc
  .tuple(
    fc.integer({ min: 1, max: 2 }), // burstCount: 1 or 2 distinct shake gestures
    fc.double({ min: 4.5, max: 5.5, noNaN: true }), // realistic human hand shake frequency (Hz)
    fc.double({ min: 25.0, max: 35.0, noNaN: true }), // peak acceleration m/s² (>> 18.0)
    fc.double({ min: 340, max: 400, noNaN: true }), // realistic gesture duration ms (3 peaks in ~250ms, ends before 400ms cooldown)
  )
  .map(([burstCount, freqHz, peakAcc, burstDurationMs]) =>
    createContinuousShakeTrajectory({
      burstCount,
      burstDurationMs,
      restDurationMs: 600, // pause > 400ms cooldown
      freqHz,
      peakAcc,
    }),
  );

/**
 * Samples a continuous trajectory at a given sample rate (in Hz).
 */
export function sampleTrajectory(traj: ContinuousTrajectory, rateHz: number, startT = 0): Sample[] {
  const dtMs = 1000 / rateHz;
  const samples: Sample[] = [];
  const count = Math.floor(traj.durationMs / dtMs);

  for (let i = 0; i <= count; i++) {
    const t = startT + Math.round(i * dtMs);
    const state = traj.sampleAt(i * dtMs);
    samples.push({
      t,
      ax: state.ax,
      ay: state.ay,
      az: state.az,
      gx: state.gx,
      gy: state.gy,
      gz: state.gz,
      alpha: 0,
      beta: state.beta,
      gamma: state.gamma,
      rms: 0,
    });
  }

  return samples;
}

/**
 * Generates a shaking sample stream at a given sample rate.
 */
export function shakingStreamGen(rateHz = 60): fc.Arbitrary<Sample[]> {
  return shakingTrajectoryArb.map((traj) => sampleTrajectory(traj, rateHz));
}

/**
 * Result of a generated rotating stream under SO(3) 3D rotation.
 */
export interface RotatingStreamResult {
  samples: Sample[];
  unrotated: Sample[];
  rotated: Sample[];
  R: Matrix3x3;
}

export interface RotatingStreamOptions {
  sampleRateHz?: number;
  baseStreamArb?: fc.Arbitrary<Sample[]>;
}

/**
 * Generates an acceleration stream rotated by an arbitrary 3D SO(3) rotation matrix.
 * Invariant 2 (§4.1): Rotating any acceleration stream by an arbitrary 3D rotation matrix R in SO(3)
 * produces the exact same shake event timestamps.
 */
export function rotatingStreamGen(
  optionsOrRate: number | RotatingStreamOptions = 60,
): fc.Arbitrary<RotatingStreamResult> {
  const rateHz = typeof optionsOrRate === "number" ? optionsOrRate : (optionsOrRate.sampleRateHz ?? 60);
  const baseArb =
    typeof optionsOrRate === "object" && optionsOrRate.baseStreamArb
      ? optionsOrRate.baseStreamArb
      : shakingStreamGen(rateHz);

  return fc.tuple(baseArb, so3RotationArb).map(([unrotated, R]) => {
    const rotated = rotateSampleStream(unrotated, R);
    return {
      samples: rotated,
      unrotated,
      rotated,
      R,
    };
  });
}

/**
 * Continuous repetition exercise trajectory with N distinct reps.
 */
export interface RepTrajectoryConfig {
  repCount: number;
  repDurationMs: number;
  restDurationMs: number;
  peakAngleDeg: number;
}

export function createContinuousRepTrajectory(config: RepTrajectoryConfig): ContinuousTrajectory {
  const { repCount, repDurationMs, restDurationMs, peakAngleDeg } = config;
  const cycleDuration = repDurationMs + restDurationMs;
  const totalDuration = repCount * cycleDuration;

  return {
    durationMs: totalDuration,
    sampleAt(t: number) {
      const cycleIndex = Math.floor(t / cycleDuration);
      if (cycleIndex >= repCount) {
        return {
          ax: 0,
          ay: 0,
          az: 9.81,
          gx: 0,
          gy: 0,
          gz: 0,
          beta: 0,
          gamma: 0,
        };
      }

      const cycleTime = t % cycleDuration;
      const angle =
        cycleTime < repDurationMs ? peakAngleDeg * Math.sin((cycleTime / repDurationMs) * Math.PI) : 0;

      const rad = (angle * Math.PI) / 180;
      return {
        ax: 0,
        ay: -9.81 * Math.sin(rad),
        az: 9.81 * Math.cos(rad),
        gx: 0,
        gy: 0,
        gz: 0,
        beta: angle,
        gamma: 0,
      };
    },
  };
}

/**
 * Generates N exercise repetitions with ROM >= 45° and tempo >= 1.2s.
 */
export function repStreamGen(options?: {
  minReps?: number;
  maxReps?: number;
  sampleRateHz?: number;
}): fc.Arbitrary<{
  samples: Sample[];
  expectedReps: number;
  peakAngleDeg: number;
}> {
  const minReps = options?.minReps ?? 1;
  const maxReps = options?.maxReps ?? 4;
  const rateHz = options?.sampleRateHz ?? 60;

  return fc
    .tuple(
      fc.integer({ min: minReps, max: maxReps }),
      fc.double({ min: 55, max: 75, noNaN: true }), // ROM >= 45°
      fc.double({ min: 1400, max: 2000, noNaN: true }), // rep duration >= 1.2s
      fc.double({ min: 500, max: 900, noNaN: true }), // rest interval
    )
    .map(([repCount, peakAngleDeg, repDurationMs, restDurationMs]) => {
      const traj = createContinuousRepTrajectory({
        repCount,
        repDurationMs,
        restDurationMs,
        peakAngleDeg,
      });

      // Prepend initial resting baseline sample
      const baseSamples: Sample[] = [
        {
          t: 0,
          ax: 0,
          ay: 0,
          az: 9.81,
          gx: 0,
          gy: 0,
          gz: 0,
          alpha: 0,
          beta: 0,
          gamma: 0,
        },
      ];

      const stream = sampleTrajectory(traj, rateHz, 50);
      return {
        samples: [...baseSamples, ...stream],
        expectedReps: repCount,
        peakAngleDeg,
      };
    });
}

/**
 * Generates a stream of partial/micro movements strictly below the minRomDeg threshold (45°),
 * including resting tremors (<= 10°) and incomplete excursions (15° - 35°).
 */
export function microMotionStreamGen(
  rateHz = 60,
): fc.Arbitrary<{ samples: Sample[]; expectedCount: number }> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: 4 }), // number of small movements
      fc.double({ min: 8, max: 32, noNaN: true }), // angle strictly below 45°
      fc.double({ min: 1200, max: 1800, noNaN: true }),
    )
    .map(([count, peakDeg, durationMs]) => {
      const traj = createContinuousRepTrajectory({
        repCount: count,
        repDurationMs: durationMs,
        restDurationMs: 600,
        peakAngleDeg: peakDeg,
      });

      const baseSamples: Sample[] = [
        {
          t: 0,
          ax: 0,
          ay: 0,
          az: 9.81,
          gx: 0,
          gy: 0,
          gz: 0,
          alpha: 0,
          beta: 0,
          gamma: 0,
        },
      ];

      const samples = sampleTrajectory(traj, rateHz, 50);
      return {
        samples: [...baseSamples, ...samples],
        expectedCount: 0, // Micro-movements must NEVER increment count
      };
    });
}
