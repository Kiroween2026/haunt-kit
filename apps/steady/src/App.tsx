// Owner: Anish (built by Yadnesh while Anish is unavailable).
import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeProvider } from "@haunt-kit/ui";
import "@haunt-kit/ui/styles.css";
import "./app.css";
import { Coach, type CoachView } from "./coach";
import type { Exercise } from "./exercises";
import { memoryHistory, openHistory, type HistoryStore } from "./history";
import {
  acceptDisclaimer,
  hasAcceptedDisclaimer,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";
import { Disclaimer } from "./screens/Disclaimer";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Live } from "./screens/Live";
import { Report } from "./screens/Report";
import { Setup } from "./screens/Setup";
import { Summary } from "./screens/Summary";
import { createSpeaker } from "./speech";
import { demoSource, motionSource, type SampleSource } from "./sources";
import type { SessionSummary } from "./summary";

type Screen = "home" | "setup" | "live" | "summary" | "history" | "report";

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked storage (some private modes)
  }
};

function openStore(): HistoryStore {
  try {
    return typeof indexedDB === "undefined" ? memoryHistory() : openHistory();
  } catch {
    return memoryHistory();
  }
}

/** `?speed=N` runs the demo faster. For tests only. */
const demoSpeed = (): number => {
  const n = Number(new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("speed"));
  return Number.isFinite(n) && n >= 1 && n <= 30 ? n : 1;
};

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage()));
  const [accepted, setAccepted] = useState(() => hasAcceptedDisclaimer(storage()));
  const [screen, setScreen] = useState<Screen>("home");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [problem, setProblem] = useState<"denied" | "no-sensors" | null>(null);
  const [view, setView] = useState<CoachView | null>(null);
  const [demo, setDemo] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [saved, setSaved] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [report, setReport] = useState<SessionSummary[]>([]);
  const [back, setBack] = useState<Screen>("home");

  const store = useMemo(openStore, []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const speaker = useMemo(() => createSpeaker(undefined, undefined, () => settingsRef.current.voice), []);
  const coachRef = useRef<Coach | null>(null);
  const sourceRef = useRef<SampleSource | null>(null);

  useEffect(() => {
    saveSettings(storage(), settings);
    document.documentElement.style.fontSize = `${settings.textPercent}%`;
  }, [settings]);

  useEffect(
    () => () => {
      sourceRef.current?.stop();
      speaker.cancel();
    },
    [speaker],
  );

  const refreshHistory = async () => {
    try {
      setSessions(await store.list());
    } catch {
      setSessions([]);
    }
  };

  /** Runs inside the Start tap: speech, motion permission and wake lock must all begin here. */
  const start = (useDemo: boolean) => {
    if (!exercise) return;
    speaker.unlock();
    const coach = new Coach({ exercise, id: crypto.randomUUID(), speaker, voiceOnly: settings.voiceOnly });
    const source = useDemo ? demoSource(exercise, demoSpeed()) : motionSource();
    coachRef.current = coach;
    sourceRef.current = source;
    setDemo(useDemo);
    setProblem(null);
    setView(coach.view());
    setScreen("live");
    coach.begin();
    void source
      .start((sample) => setView(coach.push(sample)))
      .then((result) => {
        if (!result.ok) {
          source.stop();
          coachRef.current = null;
          sourceRef.current = null;
          setProblem(result.reason);
          setScreen("setup");
        }
      });
  };

  const stop = async () => {
    const coach = coachRef.current;
    if (!coach) return;
    sourceRef.current?.stop();
    sourceRef.current = null;
    coachRef.current = null;
    const result = coach.stop();
    setSummary(result);
    setSaved(false);
    setScreen("summary");
    if (result.reps > 0) {
      try {
        await store.save(result);
        setSaved(true);
      } catch {
        setSaved(false);
      }
    }
  };

  const openReport = (list: SessionSummary[], from: Screen) => {
    setReport(list);
    setBack(from);
    setScreen("report");
  };

  const body = !accepted ? (
    <Disclaimer
      onAccept={() => {
        acceptDisclaimer(storage());
        setAccepted(true);
      }}
    />
  ) : screen === "home" ? (
    <Home
      settings={settings}
      onSettings={setSettings}
      onPick={(e) => {
        setExercise(e);
        setProblem(null);
        setScreen("setup");
      }}
      onHistory={() => {
        void refreshHistory();
        setScreen("history");
      }}
    />
  ) : screen === "setup" && exercise ? (
    <Setup
      exercise={exercise}
      problem={problem}
      onStart={() => start(false)}
      onDemo={() => start(true)}
      onBack={() => setScreen("home")}
    />
  ) : screen === "live" && exercise && view ? (
    <Live
      exercise={exercise}
      view={view}
      voiceOnly={settings.voiceOnly}
      demo={demo}
      onStop={() => void stop()}
    />
  ) : screen === "summary" && summary ? (
    <Summary
      summary={summary}
      saved={saved}
      onReport={() => openReport([summary], "summary")}
      onDone={() => setScreen("home")}
    />
  ) : screen === "history" ? (
    <History
      sessions={sessions}
      onReport={(list) => openReport(list, "history")}
      onDelete={(id) => void store.remove(id).then(refreshHistory)}
      onBack={() => setScreen("home")}
    />
  ) : screen === "report" ? (
    <Report sessions={report} onBack={() => setScreen(back)} />
  ) : null;

  return (
    <ThemeProvider theme={settings.highContrast ? "contrast" : "lantern"}>
      <main className="st-app">{body}</main>
    </ThemeProvider>
  );
}
