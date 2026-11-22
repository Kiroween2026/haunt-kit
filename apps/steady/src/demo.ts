// Owner: Anish (built by Yadnesh while Anish is unavailable).
// A pretend person doing the exercise, so Steady can be tried with no phone and no movement.
import type { Sample } from "@haunt-kit/protocol";
import type { Exercise } from "./exercises";

const G = 9.81;
const RAD = Math.PI / 180;

export type DemoRep = { peakDeg: number; repSec: number; restSec: number };

/** One good rep, one that is not high enough, one too fast, and two more good ones. */
export function demoPlan(exercise: Exercise): DemoRep[] {
  const target = exercise.rep.targetRomDeg ?? 80;
  const minimum = exercise.rep.minRomDeg ?? 45;
  const slow = (exercise.rep.minTempoSec ?? 1.5) + 1;
  return [
    { peakDeg: target + 8, repSec: slow, restSec: 1.2 },
    { peakDeg: target + 5, repSec: slow, restSec: 1.2 },
    { peakDeg: (minimum + target) / 2, repSec: slow, restSec: 1.2 },
    { peakDeg: target + 8, repSec: 0.8, restSec: 1.2 },
    { peakDeg: target + 6, repSec: slow, restSec: 1.2 },
  ];
}

/** A phone turning around its x axis: the same motion a real arm gives the phone. Deterministic. */
export function demoSamples(exercise: Exercise, hz = 30, leadSec = 2.6): Sample[] {
  const plan = demoPlan(exercise);
  const total = leadSec + plan.reduce((a, r) => a + r.repSec + r.restSec, 0) + 1;
  const out: Sample[] = [];
  let seed = 7;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 0.2;
  for (let i = 0; i < Math.round(total * hz); i++) {
    const t = Math.round((i * 1000) / hz);
    let sec = t / 1000 - leadSec;
    let angle = 0;
    for (const rep of plan) {
      if (sec >= 0 && sec < rep.repSec)
        angle = (rep.peakDeg * (1 - Math.cos((2 * Math.PI * sec) / rep.repSec))) / 2;
      sec -= rep.repSec + rep.restSec;
    }
    out.push({
      t,
      ax: noise(),
      ay: G * Math.sin(angle * RAD) + noise(),
      az: G * Math.cos(angle * RAD) + noise(),
      gx: 0,
      gy: 0,
      gz: 0,
      alpha: 0,
      beta: angle,
      gamma: 0,
    });
  }
  return out;
}
