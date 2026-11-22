// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Hold Still, or the Ghost Sees You. The ghost looks away (dance!), turns (freeze!), then looks.
// Anyone still moving when it looks is out. Staying frozen the whole time earns nothing.
import type { UiView } from "@haunt-kit/protocol";
import { between, type Rng } from "./rng";
import type { GameEvent, Inputs, MiniGame, PlayerId } from "./types";

export type HoldStillPhase = "away" | "warning" | "watching";

export const AWAY_MS: readonly [number, number] = [2500, 4500];
/** The warning is longer than the hold-still detector's 1.2 s, so a quick freeze has time to register. */
export const WARNING_MS = 1700;
export const WATCHING_MS: readonly [number, number] = [1200, 2200];
export const MAX_CYCLES = 6;
export const MAX_GAME_MS = 90_000;
/** Bonus for being the last ghost standing. */
export const SURVIVOR_BONUS = 3;

export class HoldStillGame implements MiniGame {
  readonly kind = "hold-still" as const;
  elapsedMs = 0;
  phase: HoldStillPhase = "away";
  phaseLeftMs: number;
  phaseLengthMs: number;
  cycles = 0;
  readonly alive: Set<PlayerId>;
  /** In the order they went out. */
  readonly out: PlayerId[] = [];
  private readonly survived = new Map<PlayerId, number>();
  private readonly movedThisCycle = new Set<PlayerId>();
  private readonly everyone: PlayerId[];
  private finished = false;

  constructor(
    players: readonly PlayerId[],
    private readonly rng: Rng,
  ) {
    this.everyone = [...players];
    this.alive = new Set(players);
    for (const id of players) this.survived.set(id, 0);
    this.phaseLengthMs = this.phaseLeftMs = between(rng, ...AWAY_MS);
  }

  get done(): boolean {
    return this.finished;
  }

  /** The game ends when one ghost is left (or none), or after MAX_CYCLES rounds, or at the time limit. */
  private shouldEnd(): boolean {
    const solo = this.everyone.length <= 1;
    return (
      this.alive.size === 0 ||
      (!solo && this.alive.size <= 1) ||
      this.cycles >= MAX_CYCLES ||
      this.elapsedMs >= MAX_GAME_MS
    );
  }

  tick(dtMs: number, inputs: Inputs): GameEvent[] {
    if (this.finished) return [];
    const dt = Math.min(Math.max(dtMs, 0), 250);
    this.elapsedMs += dt;
    const events: GameEvent[] = [];

    if (this.phase === "away") {
      for (const id of this.alive) if (!(inputs.get(id)?.frozen ?? false)) this.movedThisCycle.add(id);
    } else if (this.phase === "watching") {
      for (const id of [...this.alive]) {
        if (!(inputs.get(id)?.frozen ?? false)) {
          this.alive.delete(id);
          this.out.push(id);
          events.push({ type: "out", playerId: id });
        }
      }
    }

    this.phaseLeftMs -= dt;
    if (this.phaseLeftMs <= 0 || (this.phase === "watching" && this.shouldEnd())) this.nextPhase(events);
    if (this.elapsedMs >= MAX_GAME_MS) this.finished = true;
    return events;
  }

  private nextPhase(events: GameEvent[]): void {
    if (this.phase === "away") {
      this.phase = "warning";
      this.phaseLengthMs = WARNING_MS;
    } else if (this.phase === "warning") {
      this.phase = "watching";
      this.phaseLengthMs = between(this.rng, ...WATCHING_MS);
    } else {
      // The ghost has looked. Everyone still here, who danced first, survived this round.
      for (const id of this.alive) {
        if (this.movedThisCycle.has(id)) this.survived.set(id, (this.survived.get(id) ?? 0) + 1);
      }
      this.movedThisCycle.clear();
      this.cycles++;
      if (this.shouldEnd()) {
        this.finished = true;
        events.push({ type: "turn", phase: "away" });
        return;
      }
      this.phase = "away";
      this.phaseLengthMs = between(this.rng, ...AWAY_MS);
    }
    this.phaseLeftMs = this.phaseLengthMs;
    events.push({ type: "turn", phase: this.phase });
  }

  /** One point for each round survived while dancing, plus a bonus for the last ghost standing. */
  points(): Map<PlayerId, number> {
    const bonus = this.finished && this.everyone.length > 1 ? this.alive : new Set<PlayerId>();
    return new Map(
      this.everyone.map((id) => [id, (this.survived.get(id) ?? 0) + (bonus.has(id) ? SURVIVOR_BONUS : 0)]),
    );
  }

  phoneUi(): UiView {
    if (this.phase === "away")
      return { view: "still", title: "Dance!", hint: "The ghost is looking away. Move your phone around." };
    if (this.phase === "warning")
      return { view: "still", title: "Freeze!", hint: "The ghost is turning. Hold still." };
    return { view: "still", title: "Don't move!", hint: "The ghost is watching." };
  }

  forfeit(id: PlayerId): void {
    if (this.alive.delete(id)) this.out.push(id);
  }
}
