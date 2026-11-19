// Owner: Yadnesh. Dot demo: every phone's tilt moves its own dot. Proves the whole path works.
//
//   pnpm dev:relay          # Node relay on :8787
//   pnpm dev:controller     # phone page on :5180 (proxies /relay)
//   pnpm dev:demo           # this page on :5181
//   cloudflared tunnel --url http://localhost:5180     # HTTPS for the iPhone
// Then open http://localhost:5181/?play=https://<your-tunnel>.trycloudflare.com

import { GhostPlayer, createRoom, synthRecording, webSocketTransport, type PlayerInfo } from "../src/index";

const params = new URLSearchParams(location.search);
const relayUrl = params.get("relay") ?? "ws://127.0.0.1:8787";
const controllerUrl = params.get("play") ?? "http://localhost:5180/";

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const dots = new Map<string, { player: PlayerInfo; x: number; y: number; tx: number; ty: number }>();

try {
  const room = await createRoom({ relayUrl, controllerUrl });
  $("qr").innerHTML = room.qrSvg; // generated locally from our own URL
  $("code").textContent = room.code;
  $("url").textContent = room.joinUrl;

  const renderList = () => {
    const ul = $("players");
    ul.replaceChildren(
      ...room.players.map((p) => {
        const li = document.createElement("li");
        li.textContent = `● ${p.name} (${p.device.os})`;
        li.style.color = p.color;
        return li;
      }),
    );
  };

  room.on("player_joined", (p) => {
    dots.set(p.playerId, { player: p, x: 0, y: 0, tx: 0, ty: 0 });
    room.setUi(p.playerId, { view: "tilt", title: "Tilt to move your dot" });
    room.sendFeedback(p.playerId, { kind: "sound", soundId: "chime" });
    renderList();
  });
  room.on("player_left", ({ playerId }) => {
    dots.delete(playerId);
    renderList();
  });
  room.on("frames", ({ playerId, samples }) => {
    const d = dots.get(playerId);
    const s = samples[samples.length - 1];
    if (!d || !s) return;
    d.tx = Math.max(-1, Math.min(1, s.gamma / 45));
    d.ty = Math.max(-1, Math.min(1, s.beta / 45));
  });
  room.on("status", (s) => ($("error").textContent = s === "connected" ? "" : `Relay: ${s}`));
  setInterval(
    () => ($("latency").textContent = room.latencyMs !== null ? `relay ${room.latencyMs} ms` : ""),
    1000,
  );

  let ghosts = 0;
  ($("ghost") as HTMLButtonElement).onclick = () => {
    ghosts++;
    const ghost = new GhostPlayer({
      relayUrl,
      roomCode: room.code,
      name: `Ghost ${ghosts}`,
      recording: synthRecording(ghosts % 2 ? "wander" : "tilt-circle", 8, 30, ghosts),
      transport: webSocketTransport,
    });
    ghost.start().catch((e: Error) => ($("error").textContent = e.message));
  };
} catch (e) {
  $("error").textContent = `${(e as Error).message} Start it with: pnpm dev:relay`;
}

function frame() {
  const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#2a2238";
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
  for (const d of dots.values()) {
    d.x += (d.tx - d.x) * 0.25;
    d.y += (d.ty - d.y) * 0.25;
    const x = w / 2 + d.x * w * 0.42;
    const y = h / 2 + d.y * h * 0.42;
    ctx.fillStyle = d.player.color;
    ctx.shadowColor = d.player.color;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(x, y, 28 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f4efff";
    ctx.font = `${16 * devicePixelRatio}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(d.player.name, x, y + 52 * devicePixelRatio);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
