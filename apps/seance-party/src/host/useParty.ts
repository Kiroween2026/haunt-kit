// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
import { useEffect, useRef, useState } from "react";
import { connect, readConfig, type Config } from "./connect";
import { Party, type PartyView } from "./party";
import { unlockAudio } from "./sound";

/** Game time moves in steps of this many ms, however fast the screen draws. */
export const STEP_MS = 33;

export type PartyState =
  { status: "connecting" } | { status: "ready"; party: Party; view: PartyView; config: Config };

export function useParty(
  search = typeof location === "undefined" ? "" : location.search,
): PartyState & { unlock: () => void } {
  const [state, setState] = useState<PartyState>({ status: "connecting" });
  const partyRef = useRef<Party | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopListening: (() => void) | undefined;
    const config = readConfig(
      search,
      import.meta.env as { VITE_RELAY_URL?: string; VITE_CONTROLLER_URL?: string },
    );

    void connect(config).then(({ room, mode }) => {
      if (cancelled) return room.close();
      const party = new Party(room, mode);
      partyRef.current = party;
      stopListening = party.subscribe((view) => setState({ status: "ready", party, view, config }));
      setState({ status: "ready", party, view: party.view(), config });

      let last = performance.now();
      let acc = 0;
      timer = setInterval(() => {
        const now = performance.now();
        acc = Math.min(acc + (now - last) * config.speed, 20_000);
        last = now;
        while (acc >= STEP_MS) {
          party.tick(STEP_MS);
          acc -= STEP_MS;
        }
      }, STEP_MS);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stopListening?.();
      partyRef.current?.close();
      partyRef.current = null;
    };
  }, [search]);

  return { ...state, unlock: unlockAudio };
}
