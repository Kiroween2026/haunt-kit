// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// A plain-data picture of the game for the screens to draw. No logic, no classes.
import { BansheeGame } from "../game/banshee";
import { HoldStillGame, type HoldStillPhase } from "../game/holdStill";
import { HOVER_MS, OuijaGame, type Point } from "../game/ouija";
import type { Session, SessionPhase } from "../game/session";
import type { GameKind, Player, PlayerId } from "../game/types";

export type GameSnap =
  | {
      kind: "ouija";
      pos: Point;
      word: string;
      index: number;
      hover: { letter: string; fraction: number } | null;
      timeLeftS: number;
      wordsDone: number;
      lettersCorrect: number;
    }
  | {
      kind: "hold-still";
      phase: HoldStillPhase;
      alive: PlayerId[];
      out: PlayerId[];
      phaseFraction: number;
      cycles: number;
    }
  | {
      kind: "banshee";
      phase: "ready" | "scream" | "done";
      secondsLeft: number;
      levels: Record<PlayerId, number>;
    };

export type Snapshot = {
  phase: SessionPhase;
  kind: GameKind | null;
  players: Player[];
  totals: Record<PlayerId, number>;
  lastRound: Record<PlayerId, number>;
  intro: { title: string; rules: string; round: number; rounds: number } | null;
  game: GameSnap | null;
  winners: PlayerId[];
};

export function snapshotGame(session: Session): GameSnap | null {
  const g = session.game;
  if (!g || session.phase !== "playing") return null;
  if (g instanceof OuijaGame) {
    return {
      kind: "ouija",
      pos: { ...g.pos },
      word: g.word,
      index: g.index,
      hover:
        g.hoverLetter && g.canPickAgain
          ? { letter: g.hoverLetter, fraction: Math.min(1, g.hoverMs / HOVER_MS) }
          : null,
      timeLeftS: Math.ceil(g.timeLeftMs / 1000),
      wordsDone: g.wordsDone,
      lettersCorrect: g.lettersCorrect,
    };
  }
  if (g instanceof HoldStillGame) {
    return {
      kind: "hold-still",
      phase: g.phase,
      alive: [...g.alive],
      out: [...g.out],
      phaseFraction: g.phaseLengthMs > 0 ? 1 - Math.max(0, g.phaseLeftMs) / g.phaseLengthMs : 0,
      cycles: g.cycles,
    };
  }
  if (g instanceof BansheeGame) {
    return {
      kind: "banshee",
      phase: g.phase,
      secondsLeft: g.secondsLeft,
      levels: Object.fromEntries(session.players.map((p) => [p.id, g.level(p.id)])),
    };
  }
  return null;
}

export function snapshot(session: Session): Snapshot {
  return {
    phase: session.phase,
    kind: session.kind,
    players: session.players.map((p) => ({ ...p })),
    totals: Object.fromEntries(session.totals),
    lastRound: Object.fromEntries(session.lastRound),
    intro: session.intro,
    game: snapshotGame(session),
    winners: session.winnerIds,
  };
}
