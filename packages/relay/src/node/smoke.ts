// Owner: Yadnesh. End-to-end check of any running relay over real WebSockets.
// Used by server.test.ts (Node relay) and by `pnpm --filter @haunt-kit/relay smoke <url>` (e.g. wrangler dev).

import { hostToRelay, phoneToRelay, relayToHost, relayToPhone } from "@haunt-kit/protocol";
import { relayEndpoint } from "../core/transport";

type Socket = { ws: WebSocket; inbox: string[]; waiters: (() => void)[]; closed: boolean };

function open(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s: Socket = { ws: new WebSocket(url), inbox: [], waiters: [], closed: false };
    s.ws.onmessage = (e) => {
      s.inbox.push(String(e.data));
      s.waiters.splice(0).forEach((w) => w());
    };
    s.ws.onclose = () => {
      s.closed = true;
      s.waiters.splice(0).forEach((w) => w());
    };
    s.ws.onopen = () => resolve(s);
    s.ws.onerror = () => reject(new Error(`could not connect to ${url}`));
  });
}

async function next(s: Socket, ms = 5000): Promise<string> {
  const deadline = Date.now() + ms;
  while (s.inbox.length === 0) {
    if (s.closed) throw new Error("socket closed while waiting");
    const left = deadline - Date.now();
    if (left <= 0) throw new Error("timed out waiting for a message");
    await new Promise<void>((r) => {
      s.waiters.push(r);
      setTimeout(r, left);
    });
  }
  return s.inbox.shift()!;
}

async function nextHost(s: Socket) {
  const r = relayToHost.decode(await next(s));
  if (!r.ok) throw new Error(r.error.message);
  return r.message;
}
async function nextPhone(s: Socket) {
  const r = relayToPhone.decode(await next(s));
  if (!r.ok) throw new Error(r.error.message);
  return r.message;
}

function check(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`smoke check failed: ${what}`);
}

/** Runs create → join → frames → ui → phone rejoin → host resume. Returns the steps that passed. */
export async function smokeTest(base: string): Promise<string[]> {
  const passed: string[] = [];
  const device = { os: "desktop" as const, browser: "smoke" };
  const host = await open(relayEndpoint(base, "host"));
  host.ws.send(hostToRelay.encode({ v: 1, type: "create_room" }));
  const ready = await nextHost(host);
  check(ready.type === "room_ready", "room_ready");
  const { roomCode, hostToken } = ready;
  passed.push(`created room ${roomCode}`);

  const phone = await open(relayEndpoint(base, "join", roomCode));
  phone.ws.send(phoneToRelay.encode({ v: 1, type: "join", roomCode, name: "Smoke", device }));
  const welcome = await nextPhone(phone);
  check(welcome.type === "welcome", "welcome");
  const joined = await nextHost(host);
  check(joined.type === "player_joined" && joined.player.playerId === welcome.playerId, "player_joined");
  passed.push("phone joined");

  const sample = { t: 1, ax: 0.5, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0, alpha: 0, beta: 10, gamma: -5 };
  phone.ws.send(phoneToRelay.encode({ v: 1, type: "sensor_frames", samples: [sample] }));
  const frames = await nextHost(host);
  check(
    frames.type === "sensor_frames" && frames.playerId === welcome.playerId,
    "frames stamped with sender",
  );
  passed.push("frames forwarded with the sender's id");

  host.ws.send(hostToRelay.encode({ v: 1, type: "ui", to: "all", ui: { view: "tilt", title: "Tilt!" } }));
  const ui = await nextPhone(phone);
  check(ui.type === "ui" && ui.ui.view === "tilt", "ui forwarded");
  passed.push("ui forwarded to the phone");

  phone.ws.close();
  const phone2 = await open(relayEndpoint(base, "join", roomCode));
  phone2.ws.send(
    phoneToRelay.encode({ v: 1, type: "join", roomCode, name: "Smoke", device, playerId: welcome.playerId }),
  );
  const welcome2 = await nextPhone(phone2);
  check(welcome2.type === "welcome" && welcome2.playerId === welcome.playerId, "rejoin keeps id");
  check(welcome2.type === "welcome" && welcome2.color === welcome.color, "rejoin keeps color");
  passed.push("phone rejoined with the same id and color");

  host.ws.close();
  await new Promise((r) => setTimeout(r, 200));
  const host2 = await open(relayEndpoint(base, "host", roomCode));
  host2.ws.send(hostToRelay.encode({ v: 1, type: "resume_room", roomCode, hostToken }));
  const resumed = await nextHost(host2);
  check(resumed.type === "room_ready" && resumed.players.length === 1, "host resume sees the player");
  passed.push("host resumed and still sees the player");

  const bad = await open(relayEndpoint(base, "join", "ZZZZ"));
  bad.ws.send(phoneToRelay.encode({ v: 1, type: "join", roomCode: "ZZZZ", name: "Lost", device }));
  const notFound = await nextPhone(bad);
  check(notFound.type === "error" && notFound.code === "room_not_found", "room_not_found");
  passed.push("unknown room gets room_not_found");

  for (const s of [phone2, host2, bad]) s.ws.close();
  return passed;
}

// CLI: tsx src/node/smoke.ts ws://127.0.0.1:8787
if (process.argv[1]?.endsWith("smoke.ts")) {
  const base = process.argv[2] ?? "ws://127.0.0.1:8787";
  smokeTest(base).then(
    (steps) => {
      for (const s of steps) console.log("✓", s);
      process.exit(0);
    },
    (e: Error) => {
      console.error("✗", e.message);
      process.exit(1);
    },
  );
}
