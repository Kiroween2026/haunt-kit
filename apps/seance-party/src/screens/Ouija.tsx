import { PlayerGhost } from "@haunt-kit/ui";
import { LETTER_POS, LETTER_RADIUS } from "../game/ouija";
import type { GameSnap, Snapshot } from "../host/snapshot";

type Snap = Extract<GameSnap, { kind: "ouija" }>;

export function Ouija({ game, snap }: { game: Snap; snap: Snapshot }) {
  const target = game.word[game.index];
  const hoverPos = game.hover ? LETTER_POS.get(game.hover.letter) : undefined;
  return (
    <div className="sp-center">
      <div className="sp-word" aria-label={`Spell ${game.word}. ${game.index} letters done.`}>
        {[...game.word].map((c, i) => (
          <span key={i} className={`sp-word__letter${i < game.index ? " sp-word__letter--done" : ""}`}>
            {c}
          </span>
        ))}
      </div>
      <svg
        className="sp-board"
        viewBox="-1.1 -1.1 2.2 2.2"
        role="img"
        aria-label={`Ouija board. Planchette near ${game.hover?.letter ?? "the middle"}.`}
      >
        <rect className="sp-board__bg" x="-1.05" y="-1.05" width="2.1" height="2.1" rx="0.12" />
        {[...LETTER_POS].map(([letter, p]) => (
          <text
            key={letter}
            className={`sp-letter${letter === target ? " sp-letter--target" : ""}`}
            x={p.x}
            y={p.y}
            fontSize={0.11}
          >
            {letter}
          </text>
        ))}
        {hoverPos && game.hover ? (
          <circle
            className="sp-ring"
            cx={hoverPos.x}
            cy={hoverPos.y}
            r={LETTER_RADIUS + 0.02}
            strokeDasharray={`${game.hover.fraction * 2 * Math.PI * (LETTER_RADIUS + 0.02)} 10`}
          />
        ) : null}
        <g transform={`translate(${game.pos.x} ${game.pos.y})`}>
          <path
            className="sp-planchette"
            d="M0 -0.13 C0.1 -0.13 0.14 -0.04 0.1 0.06 L0 0.14 L-0.1 0.06 C-0.14 -0.04 -0.1 -0.13 0 -0.13 Z"
          />
          <circle className="sp-ring" cx="0" cy="0" r="0.04" />
        </g>
      </svg>
      <div className="sp-stats">
        <span>Time left: {game.timeLeftS} s</span>
        <span>Words: {game.wordsDone}</span>
        <span>Letters: {game.lettersCorrect}</span>
      </div>
      <div className="sp-ghosts">
        {snap.players.map((p) => (
          <PlayerGhost key={p.id} name={p.name} color={p.color} status={p.left ? "away" : "ready"} />
        ))}
      </div>
    </div>
  );
}
