// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
import { useEffect, useRef } from "react";
import { ThemeProvider, ToastRegion, useToasts } from "@haunt-kit/ui";
import "@haunt-kit/ui/styles.css";
import "./app.css";
import { useParty } from "./host/useParty";
import { play } from "./host/sound";
import { Banshee } from "./screens/Banshee";
import { HoldStill } from "./screens/HoldStill";
import { Intro } from "./screens/Intro";
import { Lobby } from "./screens/Lobby";
import { Ouija } from "./screens/Ouija";
import { Results } from "./screens/Results";
import { Winner } from "./screens/Winner";

export function App() {
  const state = useParty();
  const { toasts, push, dismiss } = useToasts(3500);
  const lastToast = useRef<string | null>(null);
  const winnerSounded = useRef(false);

  const view = state.status === "ready" ? state.view : null;
  const party = state.status === "ready" ? state.party : null;

  useEffect(() => {
    if (view?.toast && view.toast !== lastToast.current) {
      lastToast.current = view.toast;
      push(view.toast);
      party?.clearToast();
    }
  }, [view?.toast, party, push]);

  useEffect(() => {
    if (view?.game.phase === "winner" && !winnerSounded.current) {
      winnerSounded.current = true;
      play("win");
    }
    if (view?.game.phase !== "winner") winnerSounded.current = false;
  }, [view?.game.phase]);

  if (!view || !party) {
    return (
      <ThemeProvider theme="haunted">
        <main className="sp-app" aria-busy="true">
          <h1>Séance Party</h1>
          <p className="sp-note">Opening the séance…</p>
        </main>
      </ThemeProvider>
    );
  }

  const { game, lobby } = view;
  const g = game.game;
  const announce =
    game.phase === "intro" && game.intro
      ? `Game ${game.intro.round} of ${game.intro.rounds}: ${game.intro.title}`
      : game.phase === "winner"
        ? "The séance is over"
        : "";

  return (
    <ThemeProvider theme="haunted" onPointerDown={state.unlock}>
      <main className="sp-app">
        <header className="sp-header">
          <h1>Séance Party</h1>
          <span className="sp-badge">
            {lobby.mode === "live" ? `Room ${lobby.code}` : "Practice mode (no phones)"}
            {game.phase !== "lobby" && game.intro
              ? ` · Game ${game.intro.round} of ${game.intro.rounds}`
              : ""}
          </span>
        </header>
        <div className="hk-visually-hidden" role="status" aria-live="polite">
          {announce}
        </div>

        {game.phase === "lobby" ? (
          <Lobby
            party={party}
            lobby={lobby}
            onStart={() => {
              state.unlock();
              party.start();
            }}
          />
        ) : game.phase === "intro" ? (
          <Intro game={game} />
        ) : game.phase === "playing" && g?.kind === "ouija" ? (
          <Ouija game={g} snap={game} />
        ) : game.phase === "playing" && g?.kind === "hold-still" ? (
          <HoldStill game={g} snap={game} />
        ) : game.phase === "playing" && g?.kind === "banshee" ? (
          <Banshee game={g} snap={game} />
        ) : game.phase === "results" ? (
          <Results game={game} />
        ) : (
          <Winner game={game} party={party} />
        )}
        <ToastRegion toasts={toasts} onDismiss={dismiss} />
      </main>
    </ThemeProvider>
  );
}
