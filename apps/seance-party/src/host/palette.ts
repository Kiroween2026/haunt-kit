// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Same colors the relay gives players (PLAYER_COLORS in @haunt-kit/relay), so bots can take unused ones.
export const PALETTE = [
  "#8be9fd",
  "#ff79c6",
  "#50fa7b",
  "#ffb86c",
  "#bd93f9",
  "#f1fa8c",
  "#ff5555",
  "#e6e6e6",
] as const;

export const BOT_NAMES = [
  "Wisp",
  "Boo",
  "Casper",
  "Spooky",
  "Phantom",
  "Specter",
  "Poltergeist",
  "Banshee",
] as const;

export function freeColor(used: readonly string[]): string {
  return PALETTE.find((c) => !used.includes(c)) ?? PALETTE[0];
}

export function freeBotName(used: readonly string[]): string {
  const base = BOT_NAMES.find((n) => !used.includes(n));
  if (base) return base;
  let i = 2;
  while (used.includes(`Ghost ${i}`)) i++;
  return `Ghost ${i}`;
}
