// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// AI ghost bots. They produce the same Input a phone does, with human-like mistakes: a slow
// reaction, a wobbly aim, a missed freeze. A game can't tell a bot from a person.
import type { BansheeGame } from "./banshee";
import type { HoldStillGame } from "./holdStill";
import { LETTER_POS, LETTER_RADIUS, type OuijaGame } from "./ouija";
import { between, clamp, createRng, type Rng } from "./rng";
import type { Input, MiniGame } from "./types";

export type Difficulty = "easy" | "normal" | "spooky";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "spooky"];

type Skill = {
  /** How long the bot takes to react, in ms. */
  reactionMs: number;
  /** How wobbly its aim is, 0 to 1. */
  wobble: number;
  /** Chance of fumbling the freeze in a round. */
  fumble: number;
  /** How loud it screams, 0 to 1. */
  loudness: number;
};

export const SKILLS: Record<Difficulty, Skill> = {
  easy: { reactionMs: 1000, wobble: 0.75, fumble: 0.3, loudness: 0.45 },
  normal: { reactionMs: 550, wobble: 0.4, fumble: 0.12, loudness: 0.7 },
  spooky: { reactionMs: 250, wobble: 0.15, fumble: 0.03, loudness: 0.92 },
};

const IDLE: Input = { tilt: { x: 0, y: 0 }, rms: 0, frozen: false };

export class Bot {
  private readonly rng: Rng;
  private readonly skill: Skill;
  private wander = { x: 0, y: 0 };
  private sinceChange = 0;
  private lastTarget = "";
  private reactLeft = 0;
  private lastPhase = "";
  private frozen = false;
  private fumbled = false;
  private screamAge = 0;

  constructor(
    readonly difficulty: Difficulty,
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.skill = SKILLS[difficulty];
  }

  /** What this bot is doing now. Call once per tick with the running game. */
  think(dtMs: number, game: MiniGame | null): Input {
    if (!game) return IDLE;
    switch (game.kind) {
      case "ouija":
        return this.ouija(dtMs, game as OuijaGame);
      case "hold-still":
        return this.holdStill(dtMs, game as HoldStillGame);
      default:
        return this.banshee(dtMs, game as BansheeGame);
    }
  }

  private ouija(dt: number, game: OuijaGame): Input {
    const target = `${game.word}${game.index}`;
    if (target !== this.lastTarget) {
      this.lastTarget = target;
      this.reactLeft = this.skill.reactionMs * between(this.rng, 0.7, 1.3);
    }
    this.reactLeft -= dt;
    this.sinceChange += dt;
    if (this.sinceChange > 400) {
      this.sinceChange = 0;
      this.wander = {
        x: between(this.rng, -1, 1) * this.skill.wobble,
        y: between(this.rng, -1, 1) * this.skill.wobble,
      };
    }
    let aim = { x: 0, y: 0 };
    if (this.reactLeft <= 0) {
      const goal = LETTER_POS.get(game.target)!;
      const dx = goal.x - game.pos.x;
      const dy = goal.y - game.pos.y;
      const dist = Math.hypot(dx, dy);
      // Slow down near the letter, so it can rest on it for the full second.
      const strength = clamp(dist / 0.15, 0, 1);
      aim = dist > 0 ? { x: (dx / dist) * strength, y: (dy / dist) * strength } : aim;
      if (dist < 0.06) this.wander = { x: 0, y: 0 };
      // A double letter (BOO, SPOOK): step off the letter first, or it can't be picked again.
      if (!game.canPickAgain && dist < LETTER_RADIUS * 1.5) aim = { x: 0, y: game.pos.y < 0.1 ? 1 : -1 };
    }
    return {
      tilt: { x: clamp(aim.x + this.wander.x * 0.5, -1, 1), y: clamp(aim.y + this.wander.y * 0.5, -1, 1) },
      rms: 0,
      frozen: false,
    };
  }

  private holdStill(dt: number, game: HoldStillGame): Input {
    if (game.phase !== this.lastPhase) {
      this.lastPhase = game.phase;
      if (game.phase === "away") {
        this.frozen = false;
        this.fumbled = false;
      } else if (game.phase === "warning") {
        this.reactLeft = this.skill.reactionMs * between(this.rng, 0.7, 1.3);
        this.fumbled = this.rng() < this.skill.fumble;
      }
    }
    if (game.phase === "warning" && !this.fumbled) {
      this.reactLeft -= dt;
      if (this.reactLeft <= 0) this.frozen = true;
    }
    this.sinceChange += dt;
    if (this.sinceChange > 300) {
      this.sinceChange = 0;
      this.wander = { x: between(this.rng, -1, 1), y: between(this.rng, -1, 1) };
    }
    return { tilt: this.frozen ? { x: 0, y: 0 } : this.wander, rms: 0, frozen: this.frozen };
  }

  private banshee(dt: number, game: BansheeGame): Input {
    if (game.phase !== "scream") {
      this.screamAge = 0;
      return IDLE;
    }
    this.screamAge += dt;
    if (this.screamAge < this.skill.reactionMs) return { ...IDLE, rms: 0.03 };
    const rms = this.skill.loudness * between(this.rng, 0.85, 1);
    return { tilt: { x: 0, y: 0 }, rms: clamp(rms, 0, 1), frozen: false };
  }
}
