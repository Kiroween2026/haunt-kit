// Owner: Yadnesh. Cloudflare Worker + one Durable Object per room (WebSocket hibernation API).
// Room logic is in core/room.ts. This file only adapts it to Durable Objects.
//
// Routes:  /host            new room (the Worker picks a free code)
//          /host?room=ABCD  host resume
//          /join?room=ABCD  phone
//          /health
// There is no admin API here. The Séance MCP talks to the Node dev relay only.

import { generateRoomCode, normalizeRoomCode } from "@haunt-kit/protocol";
import { Room, newRoomState, type RoomSocket, type RoomState, type SocketMeta } from "./core/room";

// Minimal Cloudflare types, so the package keeps one tsconfig with DOM + Node types.
interface CfWebSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(ws: CfWebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): CfWebSocket[];
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
declare const WebSocketPair: { new (): { 0: CfWebSocket; 1: CfWebSocket } };

export interface Env {
  ROOMS: DurableObjectNamespace;
  ENVIRONMENT?: string;
}

const MAX_CODE_TRIES = 8;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "" || path === "/health") {
      return Response.json({ ok: true, env: env.ENVIRONMENT ?? "unknown" });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    if (path.endsWith("/host")) {
      const resume = url.searchParams.get("room");
      if (resume !== null) {
        const code = normalizeRoomCode(resume);
        if (!code) return new Response("Bad room code", { status: 400 });
        return forward(env, request, code, "host", false);
      }
      for (let i = 0; i < MAX_CODE_TRIES; i++) {
        const res = await forward(env, request, generateRoomCode(), "host", true);
        if (res.status !== 409) return res;
      }
      return new Response("No free room code, try again", { status: 503 });
    }
    if (path.endsWith("/join")) {
      const code = normalizeRoomCode(url.searchParams.get("room") ?? "");
      if (!code) return new Response("Bad room code", { status: 400 });
      return forward(env, request, code, "player", false);
    }
    return new Response("Not found", { status: 404 });
  },
};

function forward(env: Env, request: Request, code: string, role: "host" | "player", isNew: boolean) {
  const target = new URL("https://room.internal/connect");
  target.searchParams.set("room", code);
  target.searchParams.set("role", role);
  if (isNew) target.searchParams.set("new", "1");
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(target.toString(), request));
}

export class RoomObject {
  private room: Room | null = null;
  private dirty = false;

  constructor(
    private readonly ctx: DurableObjectState,
    _env: Env,
  ) {
    // Runs again after hibernation. Socket roles come back from their attachments.
    void ctx.blockConcurrencyWhile(async () => {
      const state = await ctx.storage.get<RoomState>("state");
      if (state) this.room = this.makeRoom(state);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("room") ?? "";
    const role = url.searchParams.get("role") === "host" ? "host" : "player";

    if (role === "host" && url.searchParams.get("new") === "1") {
      if (this.room?.isTaken()) return new Response("Room code taken", { status: 409 });
      this.room = this.makeRoom(newRoomState(code));
      this.dirty = true;
    }
    this.room ??= this.makeRoom(newRoomState(code));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const since = Date.now();
    const meta: SocketMeta =
      role === "host" ? { role: "host", authed: false, since } : { role: "player", playerId: null, since };
    server.serializeAttachment(meta);
    await this.save();
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & {
      webSocket: CfWebSocket;
    });
  }

  async webSocketMessage(ws: CfWebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.room) return ws.close(4004, "room not found");
    if (typeof message !== "string") return;
    this.room.handleMessage(wrap(ws), message);
    await this.save();
  }

  async webSocketClose(ws: CfWebSocket, code: number, reason: string): Promise<void> {
    this.room?.handleClose(wrap(ws));
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    await this.save();
  }

  async webSocketError(ws: CfWebSocket): Promise<void> {
    this.room?.handleClose(wrap(ws));
    await this.save();
  }

  async alarm(): Promise<void> {
    this.room?.alarm();
    await this.save();
  }

  private makeRoom(state: RoomState): Room {
    return new Room(state, {
      sockets: () => this.ctx.getWebSockets().map(wrap),
      onStateChange: () => {
        this.dirty = true;
      },
    });
  }

  /** Saves state if it changed and keeps the alarm in sync with the next deadline. */
  private async save(): Promise<void> {
    if (!this.room) return;
    if (this.dirty) {
      this.dirty = false;
      if (this.room.state.closed) {
        await this.ctx.storage.deleteAll();
      } else {
        await this.ctx.storage.put("state", this.room.state);
      }
    }
    const next = this.room.nextAlarm();
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}

function wrap(ws: CfWebSocket): RoomSocket {
  return {
    key: ws,
    get meta() {
      return ws.deserializeAttachment() as SocketMeta;
    },
    set meta(value: SocketMeta) {
      ws.serializeAttachment(value);
    },
    send: (text) => ws.send(text),
    close: (code, reason) => ws.close(code, reason),
  };
}
