// Owner: Yadnesh. The host side of a room: what apps use through createRoom().

import {
  hostToRelay,
  relayToHost,
  type ErrorCode,
  type Feedback,
  type GestureEvent,
  type PlayerInfo,
  type Sample,
  type Target,
  type UiView,
} from "@haunt-kit/protocol";
import {
  HOST_GRACE_MS,
  relayEndpoint,
  webSocketTransport,
  type Transport,
  type TransportFactory,
} from "@haunt-kit/relay/core";
import { backoffDelay } from "./backoff";
import { Emitter } from "./emitter";
import { qrSvg } from "./qr";

export type RoomStatus = "connecting" | "connected" | "reconnecting" | "closed";

export type RoomEvents = {
  player_joined: PlayerInfo;
  player_left: { playerId: string; reason: "left" | "timeout" | "kicked" };
  gesture: { playerId: string; event: GestureEvent };
  frames: { playerId: string; samples: Sample[] };
  status: RoomStatus;
  error: { code: ErrorCode; message: string };
};

/** What every Haunt Kit app gets: from the relay, the MockTransport or local mode. */
export interface HauntRoom {
  readonly code: string;
  /** URL that phones open. Put it in a QR code (see qrSvg). */
  readonly joinUrl: string;
  /** SVG markup of a QR code for joinUrl. */
  readonly qrSvg: string;
  readonly players: readonly PlayerInfo[];
  readonly status: RoomStatus;
  /** Round trip to the relay in ms, updated every 2 s. */
  readonly latencyMs: number | null;
  on<E extends keyof RoomEvents>(event: E, handler: (payload: RoomEvents[E]) => void): () => void;
  sendFeedback(target: Target, feedback: Feedback): void;
  setUi(target: Target, ui: UiView): void;
  close(): void;
}

export type CreateRoomOptions = {
  /** e.g. "wss://haunt-kit-relay.example.workers.dev" or "ws://127.0.0.1:8787". */
  relayUrl: string;
  /** Page phones open, e.g. "https://play.example.com". Defaults to the relay's origin over https. */
  controllerUrl?: string;
  maxPlayers?: number;
  /** For tests and the MockTransport. Default: browser WebSocket. */
  transport?: TransportFactory;
  /** ms to wait for the room. Default 10 s. */
  timeoutMs?: number;
};

const PING_MS = 2000;

export class HostSession implements HauntRoom {
  code = "";
  joinUrl = "";
  qrSvg = "";
  status: RoomStatus = "connecting";
  latencyMs: number | null = null;

  private readonly events = new Emitter<RoomEvents>();
  private readonly roster = new Map<string, PlayerInfo>();
  private readonly transport: TransportFactory;
  private socket: Transport | null = null;
  private hostToken: string | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private lostAt: number | null = null;
  private closedByUser = false;

  constructor(private readonly opts: CreateRoomOptions) {
    this.transport = opts.transport ?? webSocketTransport;
  }

  get players(): readonly PlayerInfo[] {
    return [...this.roster.values()];
  }

  /** Creates the room. Resolves once the relay replies room_ready. */
  start(): Promise<this> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out creating the room. Is the relay running?"));
        this.close();
      }, this.opts.timeoutMs ?? 10_000);
      const off = this.events.on("status", (s) => {
        if (s === "connected") {
          clearTimeout(timeout);
          off();
          offError();
          resolve(this);
        } else if (s === "closed") {
          clearTimeout(timeout);
          off();
          offError();
          reject(new Error("The relay closed the connection before the room was ready."));
        }
      });
      const offError = this.events.on("error", (e) => {
        if (this.code) return;
        clearTimeout(timeout);
        off();
        offError();
        reject(new Error(`${e.code}: ${e.message}`));
      });
      this.connect();
    });
  }

  on<E extends keyof RoomEvents>(event: E, handler: (payload: RoomEvents[E]) => void): () => void {
    return this.events.on(event, handler);
  }

  sendFeedback(target: Target, feedback: Feedback): void {
    this.send({ v: 1, type: "feedback", to: target, feedback });
  }

  setUi(target: Target, ui: UiView): void {
    this.send({ v: 1, type: "ui", to: target, ui });
  }

  close(): void {
    this.closedByUser = true;
    this.stopTimers();
    this.socket?.close();
    this.socket = null;
    this.setStatus("closed");
  }

  private send(m: Parameters<typeof hostToRelay.encode>[0]): void {
    if (this.status === "connected") this.socket?.send(hostToRelay.encode(m));
  }

  private connect(): void {
    const resuming = this.hostToken !== null;
    const url = relayEndpoint(this.opts.relayUrl, "host", resuming ? this.code : undefined);
    const t = this.transport(url);
    this.socket = t;
    t.onopen = () => {
      if (resuming) {
        t.send(
          hostToRelay.encode({ v: 1, type: "resume_room", roomCode: this.code, hostToken: this.hostToken! }),
        );
      } else {
        t.send(
          hostToRelay.encode({
            v: 1,
            type: "create_room",
            ...(this.opts.maxPlayers ? { maxPlayers: this.opts.maxPlayers } : {}),
          }),
        );
      }
    };
    t.onmessage = (text) => this.onMessage(text);
    t.onclose = () => {
      if (this.socket !== t) return;
      this.socket = null;
      this.onLost();
    };
  }

  private onMessage(text: string): void {
    const r = relayToHost.decode(text);
    if (!r.ok) return;
    const m = r.message;
    switch (m.type) {
      case "room_ready": {
        const first = !this.code;
        this.code = m.roomCode;
        this.hostToken = m.hostToken;
        if (first) {
          this.joinUrl = joinUrlFor(
            this.opts.controllerUrl ?? defaultControllerUrl(this.opts.relayUrl),
            m.roomCode,
          );
          this.qrSvg = qrSvg(this.joinUrl);
        }
        // Reconcile after a resume: players may have timed out or joined while we were away.
        const now = new Map(m.players.map((p) => [p.playerId, p]));
        for (const id of [...this.roster.keys()]) {
          if (!now.has(id)) {
            this.roster.delete(id);
            this.events.emit("player_left", { playerId: id, reason: "timeout" });
          }
        }
        for (const p of m.players) {
          if (!this.roster.has(p.playerId)) {
            this.roster.set(p.playerId, p);
            this.events.emit("player_joined", p);
          }
        }
        this.attempt = 0;
        this.lostAt = null;
        this.startPing();
        return this.setStatus("connected");
      }
      case "player_joined":
        this.roster.set(m.player.playerId, m.player);
        return this.events.emit("player_joined", m.player);
      case "player_left":
        this.roster.delete(m.playerId);
        return this.events.emit("player_left", { playerId: m.playerId, reason: m.reason });
      case "sensor_frames":
        return this.events.emit("frames", { playerId: m.playerId, samples: m.samples });
      case "gesture":
        return this.events.emit("gesture", { playerId: m.playerId, event: m.event });
      case "pong":
        this.latencyMs = Math.max(0, Math.round(Date.now() - m.t));
        return;
      case "ping":
        return this.socket?.send(hostToRelay.encode({ v: 1, type: "pong", t: m.t }));
      case "error":
        this.events.emit("error", { code: m.code, message: m.message });
        if (m.code === "not_allowed" && this.status === "reconnecting") this.giveUp();
        return;
    }
  }

  private onLost(): void {
    this.stopTimers();
    if (this.closedByUser || this.status === "closed") return;
    if (!this.hostToken) return this.giveUp(); // never got a room: nothing to resume
    this.lostAt ??= Date.now();
    if (Date.now() - this.lostAt >= HOST_GRACE_MS) return this.giveUp();
    this.setStatus("reconnecting");
    this.retryTimer = setTimeout(() => this.connect(), backoffDelay(this.attempt++));
  }

  private giveUp(): void {
    this.stopTimers();
    this.socket?.close();
    this.socket = null;
    this.setStatus("closed");
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ping = () => this.socket?.send(hostToRelay.encode({ v: 1, type: "ping", t: Date.now() }));
    ping();
    this.pingTimer = setInterval(ping, PING_MS);
  }

  private stopTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pingTimer = null;
    this.retryTimer = null;
  }

  private setStatus(s: RoomStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.events.emit("status", s);
  }
}

/** Creates a room on a relay. */
export function createRoom(options: CreateRoomOptions): Promise<HauntRoom> {
  return new HostSession(options).start();
}

export function joinUrlFor(controllerUrl: string, code: string): string {
  const url = new URL(controllerUrl);
  url.searchParams.set("room", code);
  return url.toString();
}

function defaultControllerUrl(relayUrl: string): string {
  const url = new URL(relayUrl);
  url.protocol = url.protocol === "ws:" || url.protocol === "http:" ? "http:" : "https:";
  url.pathname = "/";
  url.search = "";
  return url.toString();
}
