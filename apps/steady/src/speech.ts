// Owner: Anish (built by Yadnesh while Anish is unavailable).
// Speaking out loud. On iPhone, speech must be started from a tap, so unlock() runs inside the Start tap.

export interface Speaker {
  readonly supported: boolean;
  /** Call from a tap. Lets the browser speak later, without a tap. */
  unlock(): void;
  /** Says something now. Whatever was being said is cut off, so counts never pile up. */
  say(text: string): void;
  cancel(): void;
}

type Synth = Pick<SpeechSynthesis, "speak" | "cancel">;
type Utter = new (text: string) => { text: string; volume: number; rate: number; lang: string };

export function createSpeaker(
  synth: Synth | undefined = typeof speechSynthesis === "undefined" ? undefined : speechSynthesis,
  Utterance: Utter | undefined = typeof SpeechSynthesisUtterance === "undefined"
    ? undefined
    : (SpeechSynthesisUtterance as unknown as Utter),
  enabled: () => boolean = () => true,
): Speaker {
  const supported = !!synth && !!Utterance;
  return {
    supported,
    unlock() {
      if (!supported) return;
      const u = new Utterance!(" ");
      u.volume = 0;
      synth!.speak(u as unknown as SpeechSynthesisUtterance);
    },
    say(text) {
      if (!supported || !enabled() || text.trim() === "") return;
      synth!.cancel();
      const u = new Utterance!(text);
      u.rate = 0.95;
      synth!.speak(u as unknown as SpeechSynthesisUtterance);
    },
    cancel() {
      if (supported) synth!.cancel();
    },
  };
}
