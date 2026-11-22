// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// A small seeded random generator, so games and tests can be replayed from a seed.

export type Rng = () => number;

/** mulberry32: returns numbers in [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
