// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
import type { Detector, GestureEvent, Sample } from "@haunt-kit/protocol";

/** Configuration options for the Rep Detector (Steady). */
export interface RepConfig {
  /** A rep must reach at least this range of motion to count, in degrees. Default: 45 */
  minRomDeg: number;
  /** A rep has "full range" at or above this many degrees. Default: 70 */
  targetRomDeg: number;
  /** The angle must pass this to start a rep, and fall below it to end one, in degrees. Default: 10 */
  hysteresisDeg: number;
  /** A rep faster than this is "too fast", in seconds. Default: 1.2 */
  minTempoSec: number;
  /** The phone must be held still this long to set the start position, in ms. Default: 2000 */
  calibrationMs: number;
  /** Smoothing time constant for the angle, in ms. Default: 100 */
  smoothingMs: number;
}

export const DEFAULT_REP_CONFIG: RepConfig = {
  minRomDeg: 45,
  targetRomDeg: 70,
  hysteresisDeg: 10,
  minTempoSec: 1.2,
  calibrationMs: 2000,
  smoothingMs: 100,
};

/** If the phone moves more than this while calibrating, calibration starts over. */
const CALIBRATION_WOBBLE_DEG = 12;
const DEG = 180 / Math.PI;

type Vec = [number, number, number];

function unit(ax: number, ay: number, az: number): Vec | null {
  const m = Math.hypot(ax, ay, az);
  return m < 1 ? null : [ax / m, ay / m, az / m]; // under 1 m/s² is free fall: no usable direction
}

/** Normalizes a vector that is already known to be non-zero (sums of unit vectors). */
function normalize(v: Vec): Vec {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

function angleBetween(a: Vec, b: Vec): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, dot))) * DEG;
}

/**
 * Rep counter for Steady. The angle is how far the direction of gravity (as the phone sees it)
 * has turned away from the start position. That works however the phone is held or strapped:
 * a shoulder raise or a bicep curl both turn the phone away from where it started.
 *
 * 1. Calibration: hold still for `calibrationMs`. Fires `rep-calibrated`.
 *    If the phone moves during calibration, it starts over.
 * 2. The angle is smoothed with a time-based moving average (same result at any sample rate).
 * 3. Rest → moving when the angle passes `hysteresisDeg`; moving → rest when it falls back below.
 *    The peak angle during the movement is the range of motion (ROM).
 * 4. A movement with ROM ≥ `minRomDeg` is a rep and fires `rep` with
 *    `count`, `romDeg`, `tempoSec`, `fullRange` (ROM ≥ targetRomDeg), `tooFast` (tempo < minTempoSec).
 *    Smaller movements never count.
 */
export function createRepDetector(customConfig?: Partial<RepConfig>) {
  const config = { ...DEFAULT_REP_CONFIG, ...customConfig };
  const hysteresis = config.hysteresisDeg > 0 ? config.hysteresisDeg : DEFAULT_REP_CONFIG.hysteresisDeg;
  const minRom = Math.max(hysteresis, config.minRomDeg);
  const targetRom = Math.max(minRom, config.targetRomDeg);
  const minTempoSec = Math.max(0, config.minTempoSec);
  const calibrationMs = Math.max(0, config.calibrationMs);
  const tau = Math.max(1, config.smoothingMs);

  // calibration
  let calStart: number | null = null;
  let calSum: Vec = [0, 0, 0];
  let calCount = 0;
  let rest: Vec | null = null;
  // tracking
  let smooth = 0;
  let prevT: number | null = null;
  let moving = false;
  let moveStart = 0;
  let peak = 0;
  let count = 0;
  let lastT = 0;

  const restartCalibration = () => {
    calStart = null;
    calSum = [0, 0, 0];
    calCount = 0;
  };
  const clearAll = () => {
    restartCalibration();
    rest = null;
    smooth = 0;
    prevT = null;
    moving = false;
    peak = 0;
    count = 0;
  };

  return {
    push(s: Sample): GestureEvent[] {
      const { t } = s;
      if (![t, s.ax, s.ay, s.az].every(Number.isFinite)) return [];
      if (prevT !== null && t < prevT) clearAll();
      lastT = t;
      const v = unit(s.ax, s.ay, s.az);
      if (!v) return [];

      if (!rest) {
        if (calCount > 0) {
          const mean = normalize(calSum);
          if (angleBetween(v, mean) > CALIBRATION_WOBBLE_DEG) restartCalibration();
        }
        calStart ??= t;
        calSum = [calSum[0] + v[0], calSum[1] + v[1], calSum[2] + v[2]];
        calCount++;
        prevT = t;
        if (t - calStart < calibrationMs) return [];
        rest = normalize(calSum);
        smooth = 0;
        return [{ name: "rep-calibrated", t, data: { samples: calCount } }];
      }

      const angle = angleBetween(v, rest);
      const dt = prevT !== null ? Math.max(0, t - prevT) : 0;
      prevT = t;
      const a = 1 - Math.exp(-dt / tau);
      smooth += a * (angle - smooth);

      if (!moving) {
        if (smooth > hysteresis) {
          moving = true;
          moveStart = t;
          peak = smooth;
        }
        return [];
      }
      peak = Math.max(peak, smooth);
      if (smooth >= hysteresis) return [];

      // Back at rest: the movement is over.
      moving = false;
      if (peak < minRom) return [];
      count++;
      const tempoSec = (t - moveStart) / 1000;
      return [
        {
          name: "rep",
          t,
          data: {
            count,
            romDeg: peak,
            tempoSec,
            fullRange: peak >= targetRom ? 1 : 0,
            tooFast: tempoSec < minTempoSec ? 1 : 0,
          },
        },
      ];
    },
    reset(): void {
      clearAll();
    },
    /** For the live screen: where the phone is now, and how far calibration has got. */
    status(): RepStatus {
      return {
        calibrated: rest !== null,
        calibration: rest
          ? 1
          : calStart === null || calibrationMs === 0
            ? 0
            : Math.min(1, Math.max(0, (lastT - calStart) / calibrationMs)),
        angleDeg: rest ? smooth : 0,
        moving,
        count,
      };
    },
  };
}

/** What the rep detector knows right now. */
export interface RepStatus {
  calibrated: boolean;
  /** 0 to 1 while the phone is held still at the start position. */
  calibration: number;
  /** Smoothed angle from the start position, in degrees. */
  angleDeg: number;
  /** A movement is under way (the angle is above the start line). */
  moving: boolean;
  /** Reps counted so far. */
  count: number;
}

export const repDetector = {
  name: "rep",
  defaults: DEFAULT_REP_CONFIG,
  create(config: Partial<RepConfig> = DEFAULT_REP_CONFIG) {
    return createRepDetector(config);
  },
} satisfies Detector<RepConfig>;
