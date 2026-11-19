// Owner: Yadnesh. Reconnect delays: 0.5 s, 1 s, 2 s, 4 s, then 5 s, with ±20 % jitter.

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(5000, 500 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + 0.4 * random()));
}
