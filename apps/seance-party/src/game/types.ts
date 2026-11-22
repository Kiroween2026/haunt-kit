// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
import type { UiView } from "@haunt-kit/protocol";

export type PlayerId = string;

export type Player = {
  id: PlayerId;
  name: string;
  color: string;
  /** An AI ghost bot, not a person. Games can't tell the difference. */
  bot: boolean;
  /** Left the game. Keeps their points on the board, but can never win. */
  left: boolean;
};

/** What one player is doing right now. Everything a minigame needs, from phone or bot. */
export type Input = {
  /** Tilt, each from -1 to 1 (right and down are positive). */
  tilt: { x: number; y: number };
  /** Microphone loudness, 0 to 1. */
  rms: number;
  /** The phone has been held still (the hold-still detector fired and hasn't broken). */
  frozen: boolean;
};

export const NO_INPUT: Input = { tilt: { x: 0, y: 0 }, rms: 0, frozen: false };

export type Inputs = ReadonlyMap<PlayerId, Input>;

export type GameKind = "ouija" | "hold-still" | "banshee";

/** Things that happened, for sounds and toasts. */
export type GameEvent =
  | { type: "letter"; letter: string }
  | { type: "wrong"; letter: string }
  | { type: "word"; word: string }
  | { type: "turn"; phase: "away" | "warning" | "watching" }
  | { type: "out"; playerId: PlayerId }
  | { type: "scream-start" }
  | { type: "scream-end" };

export interface MiniGame {
  readonly kind: GameKind;
  readonly done: boolean;
  /** Milliseconds since the game started. */
  readonly elapsedMs: number;
  tick(dtMs: number, inputs: Inputs): GameEvent[];
  /** Points each player has earned in this game so far. Never negative. */
  points(): Map<PlayerId, number>;
  /** What phones should show right now. */
  phoneUi(): UiView;
  /** A player left. The game goes on without them. */
  forfeit(id: PlayerId): void;
}

export const GAME_TITLES: Record<GameKind, string> = {
  ouija: "Ouija Planchette",
  "hold-still": "Hold Still",
  banshee: "Banshee Scream-off",
};

export const GAME_RULES: Record<GameKind, string> = {
  ouija:
    "Tilt together. Everyone's tilt is averaged to steer one planchette. Hover on a letter for one second to pick it.",
  "hold-still": "Dance while the ghost looks away. When it turns, freeze. Anyone still moving is out.",
  banshee: "Scream into your phone. The loudest sustained scream over two seconds wins.",
};
