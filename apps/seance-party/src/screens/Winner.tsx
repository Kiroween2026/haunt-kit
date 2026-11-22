import { Button, Card, PlayerGhost, Scoreboard } from "@haunt-kit/ui";
import type { Party } from "../host/party";
import type { Snapshot } from "../host/snapshot";

export function Winner({ game, party }: { game: Snapshot; party: Party }) {
  const won = game.players.filter((p) => game.winners.includes(p.id));
  const rows = game.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    score: game.totals[p.id] ?? 0,
  }));
  return (
    <div className="sp-center">
      <h2 className="sp-big">
        {won.length === 0
          ? "The séance is over"
          : won.length === 1
            ? "Last ghost standing!"
            : "A tie! Last ghosts standing!"}
      </h2>
      <div className="sp-ghosts">
        {won.map((p) => (
          <div key={p.id} className="sp-winner-ghost">
            <PlayerGhost name={p.name} color={p.color} />
          </div>
        ))}
      </div>
      <Card>
        <Scoreboard rows={rows} title="Final scores" />
      </Card>
      <Button size="large" onClick={() => party.playAgain()}>
        Play again
      </Button>
    </div>
  );
}
