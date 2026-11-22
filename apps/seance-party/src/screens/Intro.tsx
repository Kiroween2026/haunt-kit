import { Countdown } from "@haunt-kit/ui";
import { INTRO_MS } from "../game/session";
import type { Snapshot } from "../host/snapshot";

export function Intro({ game }: { game: Snapshot }) {
  const intro = game.intro;
  if (!intro) return null;
  return (
    <div className="sp-center">
      <p className="sp-note">
        Game {intro.round} of {intro.rounds}
      </p>
      <h2 className="sp-big">{intro.title}</h2>
      <p className="sp-rules">{intro.rules}</p>
      <Countdown from={Math.round(INTRO_MS / 1000)} urgentAt={0} />
    </div>
  );
}
