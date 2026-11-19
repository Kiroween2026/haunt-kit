// Owner: Yadnesh. Phone side of the protocol: join, rejoin, reconnect, ping. No DOM.

import {
  phoneToRelay,
  relayToPhone,
  type Feedback,
  type GestureEvent,
  type PhoneToRelayMessage,
  type Sample,
  type UiView,
} from "@haunt-kit/protocol";
import {
  Emitter,
  backoffDelay,
  relayEndpoint,
  webSocketTransport,
  type Transport,
  type TransportFactory,
} from "@haunt-kit/host-sdk";

export type FailCode = "room_not_found" | "room_full" | "replaced";

export type PhoneStatus =
  | { kind: "connecting" }
  | { kind: "joined"; playerId: string; color: string }
  | { kind: "reconnecting"; attempt: number }
  | { kind: "failed"; code: FailCode; message: string };

export type PhoneEvents = { status: PhoneStatus; ui: UiView; feedback: Feedback; latency: number };

export type KeyValue = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export type PhoneClientOptions = {
  relayUrl: string;
  roomCode: string;
  name: string;
  device: { os: "ios" | "android" | "desktop" | "other"; browser: string };
  transport?: TransportFactory;
  /** Where the playerId is kept for rejoining. Default: localStorage. */
  storage?: KeyValue;
};

const PING_MS = 2000;

export class PhoneClient {
  status: PhoneStatus = { kind: "connecting" };
  latencyMs: number | null = null;
  private readonly events = new Emitter<PhoneEvents>();
  private socket: Transport | null = null;
  private attempt = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: PhoneClientOptions) {}

  static storageKey(roomCode: string): string {
    return `haunt-kit:player:${roomCode}`;
  }

  get playerId(): string | null {
    return this.status.kind === "joined" ? this.status.playerId : null;
  }

  on<E extends keyof PhoneEvents>(event: E, handler: (p: PhoneEvents[E]) => void): () => void {
    return this.events.on(event, handler);
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }

  /** Try again right away (e.g. the page became visible after a screen lock). */
  reconnectNow(): void {
    if (this.status.kind !== "reconnecting" || this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  }

  sendFrames(samples: Sample[]): void {
    if (samples.length > 0) this.send({ v: 1, type: "sensor_frames", samples });
  }

  sendGesture(event: GestureEvent): void {
    this.send({ v: 1, type: "gesture", event });
  }

  private send(m: PhoneToRelayMessage): void {
    if (this.status.kind === "joined") this.socket?.send(phoneToRelay.encode(m));
  }

  private connect(): void {
    this.socket?.close();
    const t = (this.opts.transport ?? webSocketTransport)(
      relayEndpoint(this.opts.relayUrl, "join", this.opts.roomCode),
    );
    this.socket = t;
    t.onopen = () => {
      const saved = this.storage()?.getItem(PhoneClient.storageKey(this.opts.roomCode)) ?? undefined;
      t.send(
        phoneToRelay.encode({
          v: 1,
          type: "join",
          roomCode: this.opts.roomCode,
          name: this.opts.name,
          device: this.opts.device,
          ...(saved ? { playerId: saved } : {}),
        }),
      );
    };
    t.onmessage = (text) => this.onMessage(text);
    t.onclose = (code) => {
      if (this.socket !== t) return;
      this.socket = null;
      this.clearTimers();
      if (this.stopped || this.status.kind === "failed") return;
      if (code === 4000) return this.fail("replaced", "This player was opened somewhere else.");
      this.setStatus({ kind: "reconnecting", attempt: this.attempt });
      this.retryTimer = setTimeout(() => this.connect(), backoffDelay(this.attempt++));
    };
  }

  private onMessage(text: string): void {
    const r = relayToPhone.decode(text);
    if (!r.ok) return;
    const m = r.message;
    switch (m.type) {
      case "welcome":
        this.storage()?.setItem(PhoneClient.storageKey(this.opts.roomCode), m.playerId);
        this.attempt = 0;
        this.setStatus({ kind: "joined", playerId: m.playerId, color: m.color });
        return this.startPing();
      case "ui":
        return this.events.emit("ui", m.ui);
      case "feedback":
        return this.events.emit("feedback", m.feedback);
      case "ping":
        return this.socket?.send(phoneToRelay.encode({ v: 1, type: "pong", t: m.t }));
      case "pong":
        this.latencyMs = Math.max(0, Math.round(Date.now() - m.t));
        return this.events.emit("latency", this.latencyMs);
      case "error":
        if (m.code === "room_not_found" || m.code === "room_full") this.fail(m.code, m.message);
        return;
    }
  }

  private fail(code: FailCode, message: string): void {
    this.clearTimers();
    this.setStatus({ kind: "failed", code, message });
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ping = () => this.send({ v: 1, type: "ping", t: Date.now() });
    ping();
    this.pingTimer = setInterval(ping, PING_MS);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }

  private setStatus(s: PhoneStatus): void {
    this.status = s;
    this.events.emit("status", s);
  }

  private storage(): KeyValue | null {
    if (this.opts.storage) return this.opts.storage;
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null; // private mode or blocked storage
    }
  }
}
