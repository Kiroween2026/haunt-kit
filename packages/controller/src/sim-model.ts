// Owner: Yadnesh. Desktop simulator motion model: turns a mouse position and key presses into
// Samples that look like a real phone's. Pure, so it's tested without a browser.

import type { Sample } from "@haunt-kit/protocol";

export const G = 9.81;
export const MAX_TILT_DEG = 45;

export type SimKey = "shake" | "flick" | "spin" | "hold";

/** Pointer inside the stage (0..1 each way) → tilt in degrees. Centre = flat. */
export function tiltFromPointer(x: number, y: number): { beta: number; gamma: number } {
  const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
  return { gamma: (clamp(x) * 2 - 1) * MAX_TILT_DEG, beta: (clamp(y) * 2 - 1) * MAX_TILT_DEG };
}

/** Gravity in the phone's frame for a tilt (W3C axes, screen up → az = +g). */
export function gravity(beta: number, gamma: number): { ax: number; ay: number; az: number } {
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  return { ax: G * Math.sin(g) * Math.cos(b), ay: -G * Math.sin(b), az: G * Math.cos(g) * Math.cos(b) };
}

const BURST_MS: Record<Exclude<SimKey, "hold">, number> = { shake: 700, flick: 150, spin: 800 };

export class SimModel {
  private beta = 0;
  private gamma = 0;
  private prev: { t: number; beta: number; gamma: number } | null = null;
  private bursts: { key: Exclude<SimKey, "hold">; start: number }[] = [];
  holding = false;

  setPointer(x: number, y: number): void {
    if (this.holding) return; // holding still freezes the tilt
    const t = tiltFromPointer(x, y);
    this.beta = t.beta;
    this.gamma = t.gamma;
  }

  /** Starts a shake, flick or spin burst at time t (ms). */
  burst(key: Exclude<SimKey, "hold">, t: number): void {
    this.bursts.push({ key, start: t });
  }

  bursting(t: number): boolean {
    return this.bursts.some((b) => t - b.start < BURST_MS[b.key]);
  }

  sample(t: number, rms?: number): Sample {
    this.bursts = this.bursts.filter((b) => t - b.start < BURST_MS[b.key]);
    const { ax, ay, az } = gravity(this.beta, this.gamma);
    const s: Sample = { t, ax, ay, az, gx: 0, gy: 0, gz: 0, alpha: 0, beta: this.beta, gamma: this.gamma };
    // Rotation rate from how fast the tilt is changing (deg/s).
    if (this.prev && t > this.prev.t) {
      const dt = (t - this.prev.t) / 1000;
      s.gx = (this.beta - this.prev.beta) / dt;
      s.gy = (this.gamma - this.prev.gamma) / dt;
    }
    this.prev = { t, beta: this.beta, gamma: this.gamma };
    for (const b of this.bursts) {
      const p = (t - b.start) / 1000;
      if (b.key === "shake") {
        const k = Math.sin(p * 2 * Math.PI * 6);
        s.ax += 20 * k;
        s.ay += 8 * k;
      } else if (b.key === "flick") {
        s.ax += 25 * Math.sin((p / 0.15) * Math.PI);
      } else {
        s.gz += 540; // 540 deg/s around the screen axis: ~430° over the burst
        s.alpha = (((p * 540) % 360) + 360) % 360;
      }
    }
    if (rms !== undefined) s.rms = Math.max(0, Math.min(1, rms));
    return s;
  }
}

/** Keyboard map shown on screen and used by the simulator page. */
export const SIM_KEYS: { key: string; label: string; action: SimKey | "tap" }[] = [
  { key: "s", label: "S", action: "shake" },
  { key: "f", label: "F", action: "flick" },
  { key: "p", label: "P", action: "spin" },
  { key: "h", label: "H (hold)", action: "hold" },
  { key: " ", label: "Space", action: "tap" },
];
