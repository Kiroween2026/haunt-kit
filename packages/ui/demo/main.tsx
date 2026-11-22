// Every component, in both themes. ?theme=haunted or ?theme=lantern shows just one.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Card,
  Countdown,
  Modal,
  PlayerGhost,
  QRPanel,
  Scoreboard,
  ThemeProvider,
  ToastRegion,
  useToasts,
  THEME_NAMES,
  type ThemeName,
} from "../src/index";
import "../src/styles/index.css";

const QR_SVG =
  '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v1H4zM6 5h2v1H6zM5 7h3v1H5z"/></svg>';

const players = [
  { id: "1", name: "Casper", color: "#8be9fd", score: 12 },
  { id: "2", name: "Boo", color: "#ff79c6", score: 9 },
  { id: "3", name: "Wisp", color: "#50fa7b", score: 4 },
];

function Showcase({ theme }: { theme: ThemeName }) {
  const [open, setOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  return (
    <ThemeProvider theme={theme} style={{ padding: "1.5rem" }} data-testid={`theme-${theme}`}>
      <main>
        <h1>
          {theme === "haunted" ? "Séance Party" : "Steady"}: {theme}
        </h1>
        <div
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          }}
        >
          <Card title="Buttons">
            <p>Every button is at least 44 × 44 px.</p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Button>Start</Button>
              <Button variant="secondary">Back</Button>
              <Button variant="danger">Leave</Button>
              <Button disabled>Waiting</Button>
              <Button size="large">Big button</Button>
            </div>
          </Card>
          <Card title="Players">
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              {players.map((p) => (
                <PlayerGhost key={p.id} name={p.name} color={p.color} />
              ))}
              <PlayerGhost name="Eliminated" color="#ffb86c" status="out" />
              <PlayerGhost name="Dropped" color="#bd93f9" status="away" />
            </div>
          </Card>
          <Card title="Join">
            <QRPanel code="KRVX" svg={QR_SVG} joinUrl="https://play.example.com/?room=KRVX" />
          </Card>
          <Card title="Scores">
            <Scoreboard rows={players} title="Round 2" />
          </Card>
          <Card title="Countdown">
            <Countdown from={10} urgentAt={3} />
          </Card>
          <Card title="Messages">
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Button onClick={() => setOpen(true)}>Open dialog</Button>
              <Button variant="secondary" onClick={() => push("Casper joined the séance", "success")}>
                Show toast
              </Button>
            </div>
          </Card>
        </div>
        <Modal
          open={open}
          title="Leave the séance?"
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Stay
              </Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Leave
              </Button>
            </>
          }
        >
          <p>Your ghost will fade away.</p>
        </Modal>
        <ToastRegion toasts={toasts} onDismiss={dismiss} />
      </main>
    </ThemeProvider>
  );
}

const only = new URLSearchParams(location.search).get("theme");
const themes = THEME_NAMES.filter((t) => !only || t === only);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {themes.map((t) => (
      <Showcase key={t} theme={t} />
    ))}
  </StrictMode>,
);
