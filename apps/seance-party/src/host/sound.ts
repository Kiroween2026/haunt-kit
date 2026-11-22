// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Original synthesized sounds for the big screen. No audio files, so there is nothing to license.
import type { GameEvent } from "../game/types";

let ctx: AudioContext | null = null;

/** Call from a click, so the browser allows sound. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

type Tone = { freqs: number[]; ms: number; type: OscillatorType; gain?: number };

const TONES: Record<string, Tone> = {
  letter: { freqs: [660, 990], ms: 260, type: "sine" },
  wrong: { freqs: [220, 180], ms: 300, type: "square", gain: 0.12 },
  word: { freqs: [523, 659, 784, 1047], ms: 700, type: "triangle" },
  out: { freqs: [330, 220, 147], ms: 600, type: "sawtooth", gain: 0.15 },
  turn: { freqs: [440, 466, 440], ms: 700, type: "sine" },
  scream: { freqs: [880, 1760], ms: 500, type: "sawtooth", gain: 0.12 },
  win: { freqs: [392, 523, 659, 784, 1047], ms: 1400, type: "triangle" },
};

export function play(name: keyof typeof TONES): void {
  if (!ctx) return;
  const tone = TONES[name]!;
  const step = tone.ms / 1000 / tone.freqs.length;
  const start = ctx.currentTime;
  tone.freqs.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    const g = ctx!.createGain();
    osc.type = tone.type;
    osc.frequency.value = f;
    const t0 = start + i * step;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(tone.gain ?? 0.2, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + step);
    osc.connect(g).connect(ctx!.destination);
    osc.start(t0);
    osc.stop(t0 + step + 0.02);
  });
}

/** Which sound goes with a game event, if any. */
export function soundFor(event: GameEvent): keyof typeof TONES | null {
  switch (event.type) {
    case "letter":
      return "letter";
    case "wrong":
      return "wrong";
    case "word":
      return "word";
    case "out":
      return "out";
    case "turn":
      return event.phase === "watching" ? "turn" : null;
    case "scream-start":
      return "scream";
    default:
      return null;
  }
}
