// Owner: Yadnesh. Desktop simulator: joins a room exactly like a phone.
// Mouse position = tilt, S shake, F flick, P spin, H hold still, Space tap, laptop mic = scream.

import "./styles.css";
import type { Feedback, UiView } from "@haunt-kit/protocol";
import { normalizeRoomCode } from "@haunt-kit/protocol";
import { MicMeter, SAMPLE_HZ, detectBrowser } from "@haunt-kit/host-sdk";
import { PhoneClient, type PhoneStatus } from "./client";
import { cleanName, resolveRelayUrl, roomFromUrl } from "./config";
import { PHONE_DETECTORS } from "./detectors";
import { InputPipeline } from "./pipeline";
import { SIM_KEYS, SimModel } from "./sim-model";
import { playSound, unlockAudio } from "./sound";

const app = document.getElementById("app")!;
const flashEl = document.getElementById("flash")!;
const NAME_KEY = "haunt-kit:name";
const relayUrl = resolveRelayUrl(location, import.meta.env.VITE_RELAY_URL as string | undefined);

const model = new SimModel();
const pipeline = new InputPipeline(PHONE_DETECTORS, new URLSearchParams(location.search).get("raw") === "1");
let client: PhoneClient | null = null;
let mic: MicMeter | null = null;
let view: UiView = { view: "wait" };
let stage: HTMLElement | null = null;
let puck: HTMLElement | null = null;
let meter: HTMLElement | null = null;
let status: HTMLElement | null = null;

function h(tag: string, props: Record<string, string> = {}, ...kids: (Node | string | null)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  for (const c of kids) if (c) el.append(c);
  return el;
}

function joinScreen(error?: string) {
  const code = h("input", {
    id: "code",
    maxlength: "4",
    placeholder: "ABCD",
    autocomplete: "off",
  }) as HTMLInputElement;
  code.value = roomFromUrl(location.search) ?? "";
  const name = h("input", {
    id: "name",
    maxlength: "20",
    placeholder: "Your ghost name",
  }) as HTMLInputElement;
  name.value = localStorage.getItem(NAME_KEY) ?? "Desk Ghost";
  const go = h("button", { type: "button" }, "Join with this computer");
  go.addEventListener("click", () => {
    const roomCode = normalizeRoomCode(code.value);
    const playerName = cleanName(name.value);
    if (!roomCode) return joinScreen("Room codes are 4 letters, like KRVX.");
    if (!playerName) return joinScreen("Pick a name first.");
    localStorage.setItem(NAME_KEY, playerName);
    unlockAudio();
    // The mic is optional: without it, screaming just doesn't count.
    // Never wait more than 4 s for the mic prompt: joining matters more.
    const micReq: Promise<MediaStream | null> = navigator.mediaDevices?.getUserMedia
      ? Promise.race([
          navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 4000)),
        ])
      : Promise.resolve(null);
    void micReq.then((stream) => {
      if (stream) mic = new MicMeter(stream);
      start(roomCode, playerName);
    });
  });
  const kids: (Node | null)[] = [
    h("h1", {}, "🖥️ Play without a phone"),
    h("p", {}, "Your mouse is the tilt, your keyboard does the gestures, your laptop mic is the scream."),
    h("div", {}, h("label", { for: "code" }, "Room code"), code),
    h("div", {}, h("label", { for: "name" }, "Your name"), name),
    error ? h("p", { class: "error", role: "alert" }, error) : null,
    go,
  ];
  app.replaceChildren(...kids.filter((k): k is Node => k !== null));
}

function start(roomCode: string, name: string) {
  client?.stop();
  client = new PhoneClient({
    relayUrl,
    roomCode,
    name,
    device: { os: "desktop", browser: detectBrowser(navigator.userAgent) },
  });
  client.on("status", onStatus);
  client.on("ui", (ui) => {
    view = ui;
    pipeline.setView(ui.view);
    renderPlay();
  });
  client.on("feedback", onFeedback);
  client.start();
  setInterval(tick, 1000 / SAMPLE_HZ);
}

function onStatus(s: PhoneStatus) {
  if (s.kind === "failed") {
    app.replaceChildren(h("h1", {}, "Couldn't join"), h("p", {}, s.message));
    return;
  }
  if (s.kind === "joined") {
    document.documentElement.style.setProperty("--player", s.color);
    if (!stage) renderPlay();
  }
  if (status)
    status.textContent = s.kind === "joined" ? `Connected · ${client?.latencyMs ?? "…"} ms` : "Reconnecting…";
}

function renderPlay() {
  const title = h("h1", {});
  title.textContent =
    view.title ??
    {
      tilt: "Move the mouse to tilt",
      still: "Hold still (press H)",
      scream: "Scream into your mic!",
      tap: "Press Space!",
      wait: "Watch the big screen",
    }[view.view];
  const hint = h("p", {});
  hint.textContent = view.hint ?? "";
  puck = h("div", { class: "puck" });
  stage = h(
    "div",
    { class: "pad", role: "application", "aria-label": "Tilt area: move the mouse here" },
    puck,
  );
  stage.addEventListener("pointermove", (e) => {
    const r = stage!.getBoundingClientRect();
    model.setPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  const bar = h("div", {});
  meter = bar;
  const keys = h(
    "p",
    { class: "small" },
    SIM_KEYS.map((k) => `${k.label} ${k.action}`).join(" · ") + (mic ? " · mic on" : " · mic off"),
  );
  status = h("div", { class: "badge" }, "Connected");
  app.replaceChildren(
    title,
    stage,
    h("div", { class: "meter", "aria-hidden": "true" }, bar),
    hint,
    keys,
    status,
  );
}

function onFeedback(f: Feedback) {
  if (f.kind === "flash") {
    flashEl.style.background = f.color;
    flashEl.style.opacity = "0.85";
    setTimeout(() => (flashEl.style.opacity = "0"), f.ms ?? 150);
  } else if (f.kind === "color") document.documentElement.style.setProperty("--player", f.color);
  else playSound(f.soundId);
}

function tick() {
  if (client?.status.kind !== "joined") return;
  const t = performance.now();
  const s = model.sample(t, mic?.rms());
  const out = pipeline.push(s, t);
  if (out.frames) client.sendFrames(out.frames);
  for (const g of out.gestures) client.sendGesture(g);
  if (puck) puck.style.transform = `translate(${(s.gamma / 45) * 140}%, ${(s.beta / 45) * 140}%)`;
  if (meter) meter.style.width = `${Math.round(Math.min(1, (s.rms ?? 0) * 2.5) * 100)}%`;
}

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.repeat || !client) return;
  const k = SIM_KEYS.find((x) => x.key === e.key.toLowerCase());
  if (!k) return;
  e.preventDefault();
  const t = performance.now();
  if (k.action === "tap") return client.sendGesture({ name: "tap", t });
  if (k.action === "hold") {
    model.holding = true;
    return;
  }
  // The motion goes through the same detectors as a real phone: shake, flick and spin events come from them.
  model.burst(k.action, t);
});
window.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "h") model.holding = false;
});

joinScreen();
