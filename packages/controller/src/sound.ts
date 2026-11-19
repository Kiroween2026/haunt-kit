// Owner: Yadnesh. Tiny synthesized sounds (original, no audio files). Unlocked by the join tap.

let ctx: AudioContext | null = null;

/** Call inside a tap so iOS allows audio later. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

const SOUNDS: Record<string, { freqs: number[]; ms: number; type: OscillatorType }> = {
  chime: { freqs: [880, 1320], ms: 350, type: "sine" },
  boo: { freqs: [180, 120], ms: 500, type: "sawtooth" },
  tick: { freqs: [1200], ms: 60, type: "square" },
  win: { freqs: [523, 659, 784, 1047], ms: 600, type: "triangle" },
  lose: { freqs: [392, 330, 262], ms: 600, type: "triangle" },
  ghost: { freqs: [440, 466, 440], ms: 900, type: "sine" },
};

export function playSound(id: string): void {
  if (!ctx) return;
  const s = SOUNDS[id] ?? { freqs: [660], ms: 150, type: "sine" as OscillatorType };
  const step = s.ms / 1000 / s.freqs.length;
  const start = ctx.currentTime;
  s.freqs.forEach((f, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = s.type;
    osc.frequency.value = f;
    const t0 = start + i * step;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t0);
    osc.stop(t0 + step + 0.02);
  });
}
