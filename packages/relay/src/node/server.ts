// Owner: Yadnesh. Node relay: local dev, the Séance MCP, integration tests and the Fly.io fallback.
// Same Room logic as the Cloudflare Durable Object.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type RawData } from "ws";
import { MAX_MESSAGE_BYTES, gestureEventSchema } from "@haunt-kit/protocol";
import { RelayHub } from "../core/hub";
import { safeEqual } from "../core/ids";

export type NodeRelayOptions = {
  port?: number;
  host?: string;
  /** Enables the dev admin API (/admin/*) for the Séance MCP. Ignored when production is true. */
  devToken?: string;
  production?: boolean;
  /** Samples kept per player for the admin API. Default 1800 (60 s at 30 Hz) when admin is on. */
  sampleBufferSize?: number;
};

export type NodeRelay = {
  url: string;
  wsUrl: string;
  hub: RelayHub;
  adminEnabled: boolean;
  close(): Promise<void>;
};

export async function startNodeRelay(opts: NodeRelayOptions = {}): Promise<NodeRelay> {
  const adminEnabled = !opts.production && !!opts.devToken && opts.devToken.length >= 16;
  const hub = new RelayHub({ sampleBufferSize: adminEnabled ? (opts.sampleBufferSize ?? 1800) : 0 });
  // Allow a bit over the protocol limit so oversized messages reach decode() and get a too_large error.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES * 4 });

  const server = createServer((req, res) => {
    handleHttp(req, res).catch(() => json(res, 500, { error: "internal error" }));
  });

  async function handleHttp(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/health") return json(res, 200, { ok: true, admin: adminEnabled });
    if (!path.startsWith("/admin")) return json(res, 404, { error: "not found" });
    // The admin API does not exist in production or without a dev token.
    if (!adminEnabled) return json(res, 404, { error: "not found" });
    const auth = req.headers.authorization ?? "";
    if (!safeEqual(auth, `Bearer ${opts.devToken}`)) return json(res, 401, { error: "unauthorized" });

    const parts = path.split("/").filter(Boolean); // admin, rooms, CODE, players, ID, samples
    if (req.method === "GET" && parts.length === 2 && parts[1] === "rooms")
      return json(res, 200, hub.listRooms());
    if (parts[1] !== "rooms" || !parts[2]) return json(res, 404, { error: "not found" });
    const code = parts[2].toUpperCase();
    if (req.method === "GET" && parts.length === 4 && parts[3] === "devices") {
      const devices = hub.devices(code);
      return devices ? json(res, 200, devices) : json(res, 404, { error: "room not found" });
    }
    const playerId = parts[4];
    if (parts[3] !== "players" || !playerId) return json(res, 404, { error: "not found" });
    if (req.method === "GET" && parts[5] === "samples") {
      const seconds = num(url.searchParams.get("seconds"));
      const sinceT = num(url.searchParams.get("sinceT"));
      const samples = hub.samples(code, playerId, {
        ...(seconds !== undefined ? { seconds } : {}),
        ...(sinceT !== undefined ? { sinceT } : {}),
      });
      return samples ? json(res, 200, { samples }) : json(res, 404, { error: "player not found" });
    }
    if (req.method === "POST" && parts[5] === "gesture") {
      const body = await readBody(req, 4096);
      const parsed = gestureEventSchema.safeParse(body === null ? null : safeJson(body));
      if (!parsed.success) return json(res, 400, { error: "body must be a GestureEvent { name, t, data? }" });
      return hub.injectGesture(code, playerId, parsed.data)
        ? json(res, 200, { ok: true })
        : json(res, 404, { error: "player not found" });
    }
    return json(res, 404, { error: "not found" });
  }

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "");
    const isHost = path.endsWith("/host");
    if (!isHost && !path.endsWith("/join")) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = {
        send: (text: string) => {
          if (ws.readyState === ws.OPEN) ws.send(text);
        },
        close: (code: number, reason: string) => ws.close(code, reason),
      };
      const room = url.searchParams.get("room") ?? undefined;
      const hubConn = isHost ? hub.openHost(conn, room) : hub.openPlayer(conn, room ?? "");
      ws.on("message", (data: RawData, isBinary: boolean) => {
        if (isBinary) return;
        hubConn.message(rawToString(data));
      });
      ws.on("close", () => hubConn.closed());
      ws.on("error", () => hubConn.closed());
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 8787, opts.host ?? "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const host = opts.host && opts.host !== "0.0.0.0" ? opts.host : "127.0.0.1";

  return {
    url: `http://${host}:${port}`,
    wsUrl: `ws://${host}:${port}`,
    hub,
    adminEnabled,
    close: async () => {
      hub.dispose();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function num(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}
