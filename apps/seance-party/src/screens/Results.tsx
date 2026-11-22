import { Card, PlayerGhost, Scoreboard } from "@haunt-kit/ui";
import type { Snapshot } from "../host/snapshot";

export function Results({ game }: { game: Snapshot }) {
  const rows = game.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    score: game.totals[p.id] ?? 0,
  }));
  return (
    <div className="sp-center">
      <h2 className="sp-big">Scores</h2>
      <Card>
        <ul className="sp-points" aria-label="Points this game">
          {game.players.map((p) => (
            <li key={p.id}>
              <PlayerGhost
                name={`${p.name}: +${game.lastRound[p.id] ?? 0}`}
                color={p.color}
                status={p.left ? "away" : "ready"}
              />
            </li>
          ))}
        </ul>
        <Scoreboard rows={rows} title="Total so far" />
      </Card>
    </div>
  );
}
