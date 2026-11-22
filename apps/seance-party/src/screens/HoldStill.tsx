import { PlayerGhost } from "@haunt-kit/ui";
import type { GameSnap, Snapshot } from "../host/snapshot";

type Snap = Extract<GameSnap, { kind: "hold-still" }>;

const TEXT = {
  away: { title: "The ghost looks away", hint: "Dance! Move your phone around." },
  warning: { title: "It's turning…", hint: "Freeze!" },
  watching: { title: "The ghost sees you", hint: "Don't move." },
} as const;

export function HoldStill({ game, snap }: { game: Snap; snap: Snapshot }) {
  const text = TEXT[game.phase];
  const eyes = game.phase !== "away";
  return (
    <div className="sp-center">
      <svg
        className={`sp-watcher sp-watcher--${game.phase}`}
        viewBox="0 0 120 130"
        role="img"
        aria-label={`Ghost: ${text.title}`}
      >
        <path
          d="M10 125 V55 C10 25 32 5 60 5 C88 5 110 25 110 55 V125 L92 108 L76 125 L60 108 L44 125 L28 108 Z"
          fill="var(--hk-color-text)"
        />
        {eyes ? (
          <>
            <circle cx="42" cy="55" r={game.phase === "watching" ? 11 : 7} fill="var(--hk-color-ink)" />
            <circle cx="78" cy="55" r={game.phase === "watching" ? 11 : 7} fill="var(--hk-color-ink)" />
            <ellipse
              cx="60"
              cy="85"
              rx="10"
              ry={game.phase === "watching" ? 14 : 8}
              fill="var(--hk-color-ink)"
            />
          </>
        ) : null}
      </svg>
      <h2 className="sp-big">{text.title}</h2>
      <p className="sp-rules">{text.hint}</p>
      <div className="sp-phase" aria-hidden="true">
        <div style={{ width: `${Math.round(game.phaseFraction * 100)}%` }} />
      </div>
      <div className="sp-ghosts">
        {snap.players.map((p) => (
          <PlayerGhost
            key={p.id}
            name={p.name}
            color={p.color}
            status={game.out.includes(p.id) ? "out" : p.left ? "away" : "ready"}
          />
        ))}
      </div>
    </div>
  );
}
