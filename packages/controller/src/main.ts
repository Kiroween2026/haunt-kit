// Owner: Yadnesh. Phone controller screens. All logic lives in client.ts and @haunt-kit/host-sdk.
// Text from the host (titles, hints) is always set with textContent, never as HTML.

import "./styles.css";
import type { ControlView, Feedback, UiView } from "@haunt-kit/protocol";
import {
  FrameBatcher,
  KeepAwake,
  MicMeter,
  MotionSampler,
  SAMPLE_HZ,
  currentDevice,
  requestSensorAccess,
  type SensorAccess,
} from "@haunt-kit/host-sdk";
import { normalizeRoomCode } from "@haunt-kit/protocol";
import { PhoneClient, type PhoneStatus } from "./client";
import { cleanName, isSecure, resolveRelayUrl, roomFromUrl } from "./config";
import { playSound, unlockAudio } from "./sound";

const app = document.getElementById("app")!;
const flashEl = document.getElementById("flash")!;
const NAME_KEY = "haunt-kit:name";
const relayUrl = resolveRelayUrl(location, import.meta.env.VITE_RELAY_URL as string | undefined);

let client: PhoneClient | null = null;
let sampler: MotionSampler | null = null;
let mic: MicMeter | null = null;
let loop: ReturnType<typeof setInterval> | null = null;
let view: UiView = { view: "wait" };
let lastSample: { beta: number; gamma: number; rms: number } = { beta: 0, gamma: 0, rms: 0 };
const awake = new KeepAwake();
const batcher = new FrameBatcher();

// ---------- tiny DOM helper ----------

type Child = Node | string | null | false;
function h(tag: string, props: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}
function show(...children: Child[]) {
  app.replaceChildren(...children.filter((c): c is Node | string => !!c));
}
function button(text: string, onClick: () => void, cls = ""): HTMLButtonElement {
  const b = h("button", { type: "button", class: cls }, text) as HTMLButtonElement;
  b.addEventListener("click", onClick);
  return b;
}

// ---------- screens ----------

function joinScreen(error?: string) {
  const roomFromLink = roomFromUrl(location.search);
  const name = h("input", {
    id: "name",
    autocomplete: "nickname",
    maxlength: "20",
    placeholder: "Your ghost name",
    enterkeyhint: "go",
  }) as HTMLInputElement;
  name.value = localStorage.getItem(NAME_KEY) ?? "";
  const code = h("input", {
    id: "code",
    autocomplete: "off",
    autocapitalize: "characters",
    maxlength: "4",
    placeholder: "ABCD",
    inputmode: "text",
  }) as HTMLInputElement;
  if (roomFromLink) code.value = roomFromLink;

  const enter = () => {
    const roomCode = normalizeRoomCode(code.value);
    const playerName = cleanName(name.value);
    if (!roomCode) return joinScreen("Room codes are 4 letters, like KRVX.");
    if (!playerName) return joinScreen("Pick a name first.");
    localStorage.setItem(NAME_KEY, playerName);
    // Everything that needs the tap (iOS) starts here, before any await.
    unlockAudio();
    const access = requestSensorAccess({ mic: true });
    void awake.enable();
    void access.then((a) => afterPermissions(a, roomCode, playerName));
  };

  show(
    h("h1", {}, "👻 Join the séance"),
    roomFromLink
      ? h("p", {}, `Room ${roomFromLink}`)
      : h("div", {}, h("label", { for: "code" }, "Room code"), code),
    h("div", {}, h("label", { for: "name" }, "Your name"), name),
    error ? h("p", { class: "error", role: "alert" }, error) : null,
    button("Enter the séance", enter),
    h("p", { class: "small" }, "We use motion and loudness only. Sound never leaves your phone."),
  );
  if (!roomFromLink && !code.value) code.focus();
}

function insecureScreen() {
  show(
    h("h1", {}, "This page needs HTTPS"),
    h(
      "p",
      {},
      "Phones only share motion sensors with secure pages. Open the https:// link from the big screen instead.",
    ),
  );
}

function motionDeniedScreen() {
  show(
    h("h1", {}, "Motion is blocked"),
    h("p", {}, "The game needs your phone's motion to work."),
    h(
      "p",
      {},
      "On iPhone: close this tab, open the link again and tap Allow. If you don't get asked, go to Settings → Apps → Safari → Advanced → Website Data, remove this site, and try again.",
    ),
    button("Try again", () => location.reload()),
  );
}

function statusScreen(s: PhoneStatus) {
  if (s.kind === "connecting")
    return show(
      h("div", { class: "spinner", role: "status", "aria-label": "Joining" }),
      h("p", {}, "Joining…"),
    );
  if (s.kind === "reconnecting") {
    return show(
      h("div", { class: "spinner", role: "status", "aria-label": "Reconnecting" }),
      h("h1", {}, "Lost the connection"),
      h("p", {}, "Reconnecting. You'll keep your place for one minute."),
    );
  }
  if (s.kind === "failed") {
    stopSampling();
    const title = {
      room_not_found: "Room not found",
      room_full: "This séance is full",
      replaced: "Opened somewhere else",
    }[s.code];
    const text = {
      room_not_found: "Check the 4-letter code on the big screen. The room may have ended.",
      room_full: "There's room for 8 ghosts at most. Wait for someone to leave and try again.",
      replaced: "This player is now playing in another tab or window.",
    }[s.code];
    return show(
      h("h1", {}, title),
      h("p", {}, text),
      button("Try another code", () => {
        history.replaceState(null, "", location.pathname);
        joinScreen();
      }),
    );
  }
  document.documentElement.style.setProperty("--player", s.color);
  renderView();
}

let viewRefs: { puck?: HTMLElement; meter?: HTMLElement } = {};

function renderView() {
  if (client?.status.kind !== "joined") return;
  const header = h(
    "div",
    { class: "player" },
    h("span", { class: "dot", "aria-hidden": "true" }),
    localStorage.getItem(NAME_KEY) ?? "You",
  );
  const title = h("h1", {});
  title.textContent = view.title ?? defaultTitle(view.view);
  const hint = h("p", {});
  hint.textContent = view.hint ?? defaultHint(view.view);
  viewRefs = {};
  let body: HTMLElement | null = null;
  if (view.view === "tilt") {
    const puck = h("div", { class: "puck" });
    body = h("div", { class: "pad", "aria-hidden": "true" }, puck);
    viewRefs.puck = puck;
  } else if (view.view === "scream") {
    const bar = h("div", {});
    body = h(
      "div",
      {
        class: "meter",
        role: "meter",
        "aria-label": "Loudness",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
      },
      bar,
    );
    viewRefs.meter = bar;
    if (!mic)
      hint.textContent =
        "Your mic is off, so screaming won't count. Reload and allow the microphone to play.";
  } else if (view.view === "tap") {
    body = button(
      view.title ?? "TAP!",
      () => {
        client?.sendGesture({ name: "tap", t: performance.now() });
        flash(
          getComputedStyle(document.documentElement).getPropertyValue("--player").trim() || "#ffffff",
          80,
        );
      },
      "huge",
    );
  }
  show(header, title, body, hint, latencyBadge());
}

function defaultTitle(v: ControlView): string {
  return {
    tilt: "Tilt your phone",
    still: "Hold still…",
    scream: "SCREAM!",
    tap: "Tap!",
    wait: "Watch the big screen",
  }[v];
}
function defaultHint(v: ControlView): string {
  return {
    tilt: "Tilt to steer. Keep the screen facing up.",
    still: "Don't move. The ghost is watching.",
    scream: "Loudness is measured on this phone. Sound is never sent.",
    tap: "Tap as fast as you can.",
    wait: "The next game is about to start.",
  }[v];
}

function latencyBadge(): HTMLElement {
  const el = h("div", { class: "badge", id: "latency" });
  el.textContent = client?.latencyMs != null ? `${client.latencyMs} ms` : "…";
  return el;
}

function flash(color: string, ms = 150) {
  flashEl.style.background = color;
  flashEl.style.opacity = "0.85";
  setTimeout(() => (flashEl.style.opacity = "0"), ms);
}

function onFeedback(f: Feedback) {
  if (f.kind === "flash") flash(f.color, f.ms ?? 150);
  else if (f.kind === "color") document.documentElement.style.setProperty("--player", f.color);
  else playSound(f.soundId);
}

// ---------- sensors ----------

function afterPermissions(access: SensorAccess, roomCode: string, name: string) {
  if (access.motion === "denied") return motionDeniedScreen();
  if (access.stream) mic = new MicMeter(access.stream);
  const device = currentDevice();
  sampler = new MotionSampler(device.os);
  sampler.start();

  client?.stop();
  client = new PhoneClient({ relayUrl, roomCode, name, device });
  client.on("status", statusScreen);
  client.on("ui", (ui) => {
    view = ui;
    renderView();
  });
  client.on("feedback", onFeedback);
  client.on("latency", (ms) => {
    const el = document.getElementById("latency");
    if (el) el.textContent = `${ms} ms`;
  });
  statusScreen(client.status);
  client.start();
  startSampling();
}

function startSampling() {
  stopSampling();
  loop = setInterval(() => {
    const t = performance.now();
    const rms = mic?.rms();
    const s = sampler?.read(t, rms);
    if (!s) return;
    lastSample = { beta: s.beta, gamma: s.gamma, rms: s.rms ?? 0 };
    const batch = batcher.push(s, t);
    if (batch) client?.sendFrames(batch);
    drawLocal();
  }, 1000 / SAMPLE_HZ);
}

function stopSampling() {
  if (loop) clearInterval(loop);
  loop = null;
  batcher.clear();
}

/** Local echo so the player sees their own input right away. */
function drawLocal() {
  if (viewRefs.puck) {
    const x = Math.max(-1, Math.min(1, lastSample.gamma / 45));
    const y = Math.max(-1, Math.min(1, lastSample.beta / 45));
    viewRefs.puck.style.transform = `translate(${x * 40}%, ${y * 40}%) translate(${x * 4}rem, ${y * 4}rem)`;
  }
  if (viewRefs.meter) {
    const pct = Math.round(Math.min(1, lastSample.rms * 2.5) * 100);
    viewRefs.meter.style.width = `${pct}%`;
    viewRefs.meter.parentElement?.setAttribute("aria-valuenow", String(pct));
  }
}

// Coming back from a locked screen: reconnect at once instead of waiting for the backoff.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") client?.reconnectNow();
});

if (!isSecure(location)) insecureScreen();
else joinScreen();
