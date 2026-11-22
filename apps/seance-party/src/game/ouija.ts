// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Ouija Planchette: everyone's tilt is averaged to steer one planchette over a board of letters.
import type { UiView } from "@haunt-kit/protocol";
import { between, clamp, pick, type Rng } from "./rng";
import type { GameEvent, Inputs, MiniGame, PlayerId } from "./types";

export type Point = { x: number; y: number };

/** The board is the square from -1 to 1 in both directions. */
export const BOARD_HALF = 1;
export const LETTER_ROWS = ["ABCDEFGHIJKLM", "NOPQRSTUVWXYZ"] as const;
/** Smaller than half the gap between neighbours (about 0.137), so no point is on two letters. */
export const LETTER_RADIUS = 0.065;
/** How long the planchette must rest on a letter to pick it. */
export const HOVER_MS = 1000;
export const OUIJA_MS = 60_000;
/** Board units per second at full tilt. */
export const SPEED = 0.9;
export const WORDS = [
  "BOO",
  "GHOST",
  "WITCH",
  "SPOOK",
  "MOON",
  "RAVEN",
  "CRYPT",
  "HAUNT",
  "SPELL",
  "BONES",
  "OMEN",
  "CURSE",
] as const;

function layout(): Map<string, Point> {
  const map = new Map<string, Point>();
  LETTER_ROWS.forEach((row, r) => {
    [...row].forEach((letter, i) => {
      const t = i / (row.length - 1);
      const arch = 0.22 * (1 - (2 * t - 1) ** 2); // the middle letters sit higher: an arc
      map.set(letter, { x: -0.82 + 1.64 * t, y: (r === 0 ? -0.12 : 0.34) - arch });
    });
  });
  return map;
}

export const LETTER_POS: ReadonlyMap<string, Point> = layout();

/** The letter under this point, or null. */
export function letterAt(p: Point): string | null {
  let best: string | null = null;
  let bestDist = LETTER_RADIUS;
  for (const [letter, pos] of LETTER_POS) {
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d <= bestDist) {
      best = letter;
      bestDist = d;
    }
  }
  return best;
}

/** The average of everyone's tilt. Each tilt is clamped to -1..1 first, so the average is too. */
export function averageTilt(tilts: readonly Point[]): Point {
  if (tilts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const t of tilts) {
    x += clamp(Number.isFinite(t.x) ? t.x : 0, -1, 1);
    y += clamp(Number.isFinite(t.y) ? t.y : 0, -1, 1);
  }
  return { x: x / tilts.length, y: y / tilts.length };
}

export class OuijaGame implements MiniGame {
  readonly kind = "ouija" as const;
  elapsedMs = 0;
  pos: Point = { x: 0, y: 0.1 };
  word: string;
  /** How many letters of `word` are spelled. */
  index = 0;
  wordsDone = 0;
  lettersCorrect = 0;
  hoverLetter: string | null = null;
  hoverMs = 0;
  /** After picking a letter, the planchette must leave it before it can pick again. */
  private armed = true;

  /** False right after a pick, until the planchette leaves that letter. Needed for double letters. */
  get canPickAgain(): boolean {
    return this.armed;
  }
  private readonly active: Set<PlayerId>;
  private readonly everyone: PlayerId[];
  private lastWord: string | null = null;

  constructor(
    players: readonly PlayerId[],
    private readonly rng: Rng,
  ) {
    this.everyone = [...players];
    this.active = new Set(players);
    this.word = this.nextWord();
  }

  get done(): boolean {
    return this.elapsedMs >= OUIJA_MS;
  }

  get timeLeftMs(): number {
    return Math.max(0, OUIJA_MS - this.elapsedMs);
  }

  get target(): string {
    return this.word[this.index] ?? this.word[0]!;
  }

  private nextWord(): string {
    let w = pick(this.rng, WORDS);
    for (let i = 0; i < 5 && w === this.lastWord; i++) w = pick(this.rng, WORDS);
    this.lastWord = w;
    return w;
  }

  tick(dtMs: number, inputs: Inputs): GameEvent[] {
    if (this.done) return [];
    const dt = Math.min(Math.max(dtMs, 0), 250);
    this.elapsedMs += dt;
    const tilts = [...this.active].map((id) => inputs.get(id)?.tilt ?? { x: 0, y: 0 });
    const avg = averageTilt(tilts);
    this.pos = {
      x: clamp(this.pos.x + avg.x * SPEED * (dt / 1000), -BOARD_HALF, BOARD_HALF),
      y: clamp(this.pos.y + avg.y * SPEED * (dt / 1000), -BOARD_HALF, BOARD_HALF),
    };

    const events: GameEvent[] = [];
    const letter = letterAt(this.pos);
    if (letter !== this.hoverLetter) {
      this.hoverLetter = letter;
      this.hoverMs = 0;
      if (letter === null) this.armed = true;
      else if (!this.armed && letter !== this.lastPicked) this.armed = true;
    }
    if (letter !== null && this.armed) {
      this.hoverMs += dt;
      if (this.hoverMs >= HOVER_MS) {
        this.pick(letter, events);
      }
    }
    return events;
  }

  private lastPicked: string | null = null;

  private pick(letter: string, events: GameEvent[]): void {
    this.hoverMs = 0;
    this.armed = false;
    this.lastPicked = letter;
    if (letter === this.target) {
      this.index++;
      this.lettersCorrect++;
      events.push({ type: "letter", letter });
      if (this.index >= this.word.length) {
        events.push({ type: "word", word: this.word });
        this.wordsDone++;
        this.word = this.nextWord();
        this.index = 0;
      }
    } else {
      events.push({ type: "wrong", letter });
    }
  }

  /** The team's score is the letters spelled correctly. Everyone who played gets it. */
  points(): Map<PlayerId, number> {
    return new Map(this.everyone.map((id) => [id, this.lettersCorrect]));
  }

  phoneUi(): UiView {
    return {
      view: "tilt",
      title: `Spell ${this.word}`,
      hint: "Everyone tilts together. Steer the planchette to the next letter.",
    };
  }

  forfeit(id: PlayerId): void {
    this.active.delete(id);
  }

  /** For the bots: where to steer. */
  get targetPos(): Point {
    return LETTER_POS.get(this.target)!;
  }
}

/** Handy for tests and for drawing. */
export const randomPoint = (rng: Rng): Point => ({ x: between(rng, -1, 1), y: between(rng, -1, 1) });
