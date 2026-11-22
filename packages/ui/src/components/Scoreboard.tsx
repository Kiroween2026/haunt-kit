import type { CSSProperties } from "react";

export type ScoreRow = { id: string; name: string; color: string; score: number };

export type ScoreboardProps = {
  rows: readonly ScoreRow[];
  title?: string;
};

/** Players ranked by score (highest first). Players with the same score share a rank. */
export function rankRows(rows: readonly ScoreRow[]): (ScoreRow & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return sorted.map((row, i) => ({
    ...row,
    rank: sorted.findIndex((r) => r.score === row.score) + 1 || i + 1,
  }));
}

export function Scoreboard({ rows, title = "Scores" }: ScoreboardProps) {
  const ranked = rankRows(rows);
  const top = ranked[0]?.score;
  return (
    <table className="hk-scoreboard">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Ghost</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((row) => (
          <tr
            key={row.id}
            className={
              row.rank === 1 && row.score === top && row.score > 0 ? "hk-scoreboard__row--leader" : undefined
            }
          >
            <td>{row.rank}</td>
            <th scope="row">
              <span
                className="hk-scoreboard__dot"
                style={{ "--player-color": row.color } as CSSProperties}
                aria-hidden="true"
              />
              {row.name}
            </th>
            <td>{row.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
