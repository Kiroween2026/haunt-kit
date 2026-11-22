import type { CSSProperties } from "react";
import type { GameSnap, Snapshot } from "../host/snapshot";

type Snap = Extract<GameSnap, { kind: "banshee" }>;

export function Banshee({ game, snap }: { game: Snap; snap: Snapshot }) {
  return (
    <div className="sp-center">
      <h2 className="sp-big">{game.phase === "ready" ? "Get ready…" : "SCREAM!"}</h2>
      <p className="sp-rules">
        {game.phase === "ready" ? "Take a deep breath." : "Loud and long. Sound stays on your phone."}
      </p>
      <div className="sp-big" role="timer" aria-live="off" aria-label={`${game.secondsLeft} seconds`}>
        {game.secondsLeft}
      </div>
      <div className="sp-levels">
        {snap.players.map((p) => {
          const level = Math.round(Math.min(1, (game.levels[p.id] ?? 0) * 1.4) * 100);
          return (
            <div key={p.id} className="sp-level" style={{ "--player-color": p.color } as CSSProperties}>
              <span>{p.name}</span>
              <div
                className="sp-level__bar"
                role="meter"
                aria-label={`${p.name} loudness`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={level}
              >
                <div style={{ width: `${level}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
