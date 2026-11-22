// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// A whole game night: intro → minigame → results, three times, then the winner.
import type { UiView } from "@haunt-kit/protocol";
import { BansheeGame } from "./banshee";
import { HoldStillGame } from "./holdStill";
import { OuijaGame } from "./ouija";
import { createRng, type Rng } from "./rng";
import {
  GAME_RULES,
  GAME_TITLES,
  type GameEvent,
  type GameKind,
  type Inputs,
  type MiniGame,
  type Player,
  type PlayerId,
} from "./types";

export type SessionPhase = "lobby" | "intro" | "playing" | "results" | "winner";

export const ROUNDS: readonly GameKind[] = ["ouija", "hold-still", "banshee"];
export const INTRO_MS = 4000;
export const RESULTS_MS = 5000;
export const MAX_PLAYERS = 8;

/** Highest total among players who didn't leave. Ties share the win. Nobody wins if everyone left. */
export function winners(totals: ReadonlyMap<PlayerId, number>, players: readonly Player[]): PlayerId[] {
  const staying = players.filter((p) => !p.left);
  if (staying.length === 0) return [];
  const best = Math.max(...staying.map((p) => totals.get(p.id) ?? 0));
  return staying.filter((p) => (totals.get(p.id) ?? 0) === best).map((p) => p.id);
}

export class Session {
  phase: SessionPhase = "lobby";
  players: Player[] = [];
  /** Total points. Never negative. */
  readonly totals = new Map<PlayerId, number>();
  /** Points from the last minigame, shown in the results. */
  readonly lastRound = new Map<PlayerId, number>();
  roundIndex = 0;
  game: MiniGame | null = null;
  phaseMs = 0;
  private rng: Rng = createRng(1);
  private seed = 1;

  constructor(private readonly rounds: readonly GameKind[] = ROUNDS) {}

  get kind(): GameKind | null {
    return this.rounds[this.roundIndex] ?? null;
  }

  /** Starts a new game night with these players (1 to 8). */
  start(players: readonly Player[], seed: number): boolean {
    const list = players.filter((p) => !p.left).slice(0, MAX_PLAYERS);
    if (list.length === 0) return false;
    this.players = list.map((p) => ({ ...p }));
    this.totals.clear();
    this.lastRound.clear();
    for (const p of this.players) this.totals.set(p.id, 0);
    this.seed = seed;
    this.rng = createRng(seed);
    this.roundIndex = 0;
    this.game = null;
    this.enter("intro");
    return true;
  }

  /** Back to the lobby. */
  reset(): void {
    this.phase = "lobby";
    this.game = null;
    this.players = [];
    this.totals.clear();
    this.lastRound.clear();
  }

  private enter(phase: SessionPhase): void {
    this.phase = phase;
    this.phaseMs = phase === "intro" ? INTRO_MS : phase === "results" ? RESULTS_MS : 0;
  }

  private startGame(): void {
    const ids = this.players.filter((p) => !p.left).map((p) => p.id);
    switch (this.kind) {
      case "ouija":
        this.game = new OuijaGame(ids, this.rng);
        break;
      case "hold-still":
        this.game = new HoldStillGame(ids, this.rng);
        break;
      default:
        this.game = new BansheeGame(ids);
    }
    this.enter("playing");
  }

  /** A player left. They keep their points on the board but can't win. */
  playerLeft(id: PlayerId): void {
    const p = this.players.find((x) => x.id === id);
    if (p) p.left = true;
    this.game?.forfeit(id);
  }

  tick(dtMs: number, inputs: Inputs): GameEvent[] {
    const dt = Math.min(Math.max(dtMs, 0), 250);
    switch (this.phase) {
      case "intro":
        this.phaseMs -= dt;
        if (this.phaseMs <= 0) this.startGame();
        return [];
      case "playing": {
        const events = this.game!.tick(dt, inputs);
        if (this.game!.done) this.finishGame();
        return events;
      }
      case "results":
        this.phaseMs -= dt;
        if (this.phaseMs <= 0) {
          this.roundIndex++;
          if (this.roundIndex >= this.rounds.length) this.enter("winner");
          else this.enter("intro");
        }
        return [];
      default:
        return [];
    }
  }

  private finishGame(): void {
    const earned = this.game!.points();
    this.lastRound.clear();
    for (const p of this.players) {
      const pts = Math.max(0, Math.round(earned.get(p.id) ?? 0));
      this.lastRound.set(p.id, pts);
      this.totals.set(p.id, (this.totals.get(p.id) ?? 0) + pts);
    }
    this.enter("results");
  }

  get winnerIds(): PlayerId[] {
    return this.phase === "winner" ? winners(this.totals, this.players) : [];
  }

  /** The title and rules of the next game, for the intro screen. */
  get intro(): { title: string; rules: string; round: number; rounds: number } | null {
    const k = this.kind;
    return k
      ? {
          title: GAME_TITLES[k],
          rules: GAME_RULES[k],
          round: this.roundIndex + 1,
          rounds: this.rounds.length,
        }
      : null;
  }

  /** What phones show right now. */
  phoneUi(): UiView {
    switch (this.phase) {
      case "lobby":
        return { view: "wait", title: "You're in!", hint: "Waiting for the big screen to start." };
      case "intro":
        return { view: "wait", title: this.intro?.title ?? "Get ready", hint: "Read the big screen." };
      case "playing":
        return this.game!.phoneUi();
      case "results":
        return { view: "wait", title: "Scores", hint: "Look at the big screen." };
      default:
        return { view: "wait", title: "The séance is over", hint: "Thanks for playing." };
    }
  }
}
