import { useState } from "react";
import { Button, Card, PlayerGhost, QRPanel } from "@haunt-kit/ui";
import { DIFFICULTIES, type Difficulty } from "../game/bots";
import type { Party, LobbyView } from "../host/party";

type Props = { party: Party; lobby: LobbyView; onStart: () => void };

/** Where a person with no phone can join from this computer. */
export function simulatorUrl(joinUrl: string): string {
  try {
    const url = new URL(joinUrl);
    const room = url.searchParams.get("room");
    url.pathname = url.pathname.replace(/\/?$/, "/") + "sim.html";
    url.search = room ? `?room=${room}` : "";
    return url.toString();
  } catch {
    return "";
  }
}

export function Lobby({ party, lobby, onStart }: Props) {
  const [level, setLevel] = useState<Difficulty>("normal");
  const full = lobby.players.length >= lobby.maxPlayers;
  const bots = lobby.players.filter((p) => p.bot);
  const sim = simulatorUrl(lobby.joinUrl);

  return (
    <div className="sp-main sp-lobby">
      <Card title={lobby.mode === "live" ? "Join with your phone" : "Practice mode"}>
        {lobby.mode === "live" ? (
          <>
            <QRPanel code={lobby.code} svg={lobby.qrSvg} joinUrl={lobby.joinUrl} />
            {sim ? (
              <p className="sp-note">
                No phone?{" "}
                <a className="sp-link" href={sim} target="_blank" rel="noreferrer">
                  Join from this computer
                </a>
                .
              </p>
            ) : null}
          </>
        ) : (
          <p className="sp-note">
            No relay found, so phones can't join. Add some ghost bots and press Start to try the game. To play
            with phones, run <code>pnpm dev:relay</code> and reload this page.
          </p>
        )}
      </Card>

      <Card title={`Ghosts (${lobby.players.length} of ${lobby.maxPlayers})`}>
        {lobby.players.length === 0 ? (
          <p className="sp-note">Nobody yet. Scan the code or add a bot.</p>
        ) : null}
        <div className="sp-ghosts">
          {lobby.players.map((p) => (
            <div key={p.id}>
              <PlayerGhost name={p.bot ? `${p.name} (bot)` : p.name} color={p.color} />
              {p.bot ? (
                <Button
                  variant="secondary"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => party.removeBot(p.id)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="sp-controls">
          <label>
            Bot skill{" "}
            <select
              className="sp-select"
              value={level}
              onChange={(e) => setLevel(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" disabled={full} onClick={() => party.addBot(level)}>
            Add a ghost bot
          </Button>
          <Button
            variant="secondary"
            disabled={full}
            onClick={() => {
              for (let i = lobby.players.length; i < Math.min(4, lobby.maxPlayers); i++) party.addBot(level);
            }}
          >
            Fill to 4
          </Button>
          {bots.length > 0 ? (
            <Button variant="danger" onClick={() => party.clearBots()}>
              Remove all bots
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="sp-center" style={{ gridColumn: "1 / -1" }}>
        <Button size="large" disabled={!lobby.canStart} onClick={onStart}>
          Start the séance
        </Button>
        {!lobby.canStart ? <p className="sp-note">Add a ghost to start.</p> : null}
      </div>
    </div>
  );
}
