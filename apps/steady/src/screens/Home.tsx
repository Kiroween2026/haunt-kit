import { Button, Card } from "@haunt-kit/ui";
import { EXERCISES, type Exercise } from "../exercises";
import type { Settings } from "../settings";

type Props = {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onPick: (e: Exercise) => void;
  onHistory: () => void;
};

export function Home({ settings, onSettings, onPick, onHistory }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onSettings({ ...settings, [key]: value });
  return (
    <>
      <header className="st-stack">
        <h1>Steady</h1>
        <p className="st-note">Counts your reps out loud and measures how far you move.</p>
      </header>

      <Card title="Pick an exercise">
        <div className="st-stack">
          {EXERCISES.map((e) => (
            <Button key={e.id} size="large" onClick={() => onPick(e)}>
              {e.name}
            </Button>
          ))}
          <Button variant="secondary" onClick={onHistory}>
            My sessions
          </Button>
        </div>
      </Card>

      <Card title="Settings">
        <div className="st-stack">
          <label className="st-toggle">
            <input
              type="checkbox"
              checked={settings.voice}
              onChange={(e) => set("voice", e.target.checked)}
            />
            Count reps out loud
          </label>
          <label className="st-toggle">
            <input
              type="checkbox"
              checked={settings.voiceOnly}
              onChange={(e) => set("voiceOnly", e.target.checked)}
            />
            Voice only (also say the instructions)
          </label>
          <label className="st-toggle">
            <input
              type="checkbox"
              checked={settings.highContrast}
              onChange={(e) => set("highContrast", e.target.checked)}
            />
            High contrast
          </label>
          <fieldset className="st-stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Text size</legend>
            <div className="st-row">
              {([100, 125, 150] as const).map((n) => (
                <label key={n} className="st-toggle">
                  <input
                    type="radio"
                    name="text-size"
                    checked={settings.textPercent === n}
                    onChange={() => set("textPercent", n)}
                  />
                  {n === 100 ? "Normal" : n === 125 ? "Large" : "Extra large"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Card>

      <p className="st-note">Steady is not a medical device. Follow your therapist's advice.</p>
    </>
  );
}
