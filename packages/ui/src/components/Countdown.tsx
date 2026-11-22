import { useEffect, useRef, useState } from "react";

export type CountdownProps = {
  /** Whole seconds to count down from. */
  from: number;
  /** Set false to hold at `from`. Default true. */
  running?: boolean;
  onDone?: () => void;
  /** The number turns red and pulses at or below this. Default 3. */
  urgentAt?: number;
};

/** Seconds left, rounded up, never below 0. */
export function secondsLeft(totalMs: number, elapsedMs: number): number {
  return Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));
}

/** A countdown. Screen readers hear it only when it ends, not every second. */
export function Countdown({ from, running = true, onDone, urgentAt = 3 }: CountdownProps) {
  const [left, setLeft] = useState(from);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setLeft(from);
    if (!running || from <= 0) return;
    const start = performance.now();
    const id = setInterval(() => {
      const next = secondsLeft(from * 1000, performance.now() - start);
      setLeft(next);
      if (next === 0) {
        clearInterval(id);
        doneRef.current?.();
      }
    }, 100);
    return () => clearInterval(id);
  }, [from, running]);

  const urgent = left > 0 && left <= urgentAt;
  return (
    <span
      className={`hk-countdown${urgent ? " hk-countdown--urgent" : ""}`}
      role="timer"
      aria-live="off"
      aria-label={`${left} seconds left`}
    >
      {left}
    </span>
  );
}
