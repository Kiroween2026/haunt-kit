// Owner: Yadnesh. Room logic for the relay, with no real sockets or timers.
// The Durable Object, the Node relay and the in-memory relay all drive this one class.

import {
  hostToRelay,
  phoneToRelay,
  relayToHost,
  relayToPhone,
  type ErrorCode,
  type GestureEvent,
  type PlayerInfo,
  type RandomBytes,
  type RelayToHostMessage,
  type RelayToPhoneMessage,
  type Sample,
} from "@haunt-kit/protocol";
import { randomId, safeEqual } from "./ids";

/** A disconnected player keeps their slot this long. */
export const PLAYER_GRACE_MS = 60_000;
/** A room without its host stays open this long. */
export const HOST_GRACE_MS = 120_000;
/** A connection must join (phone) or create/resume (host) within this time, or it's closed. */
export const JOIN_TIMEOUT_MS = 10_000;
/** Messages per second per connection. */
export const RATE_LIMIT_PER_SECOND = 60;
export const MAX_PLAYERS = 8;

/** One color per slot. Bright on dark backgrounds. */
export const PLAYER_COLORS = [
  "#8be9fd",
  "#ff79c6",
  "#50fa7b",
  "#ffb86c",
  "#bd93f9",
  "#f1fa8c",
  "#ff5555",
  "#e6e6e6",
] as const;

/** WebSocket close codes the relay uses (4000-4999 are free for apps). */
export const CLOSE = {
  replaced: 4000,
  notAllowed: 4003,
  roomNotFound: 4004,
  roomFull: 4005,
  joinTimeout: 4008,
} as const;

/** `since` is when the connection opened; used to close connections that never join. */
export type SocketMeta =
  | { role: "host"; authed: boolean; since?: number }
  | { role: "player"; playerId: string | null; retired?: boolean; since?: number };

function waitingToJoin(meta: SocketMeta): boolean {
  return meta.role === "host" ? !meta.authed : meta.playerId === null && !meta.retired;
}

/** One connection as the room sees it. `meta` must survive hibernation (serializeAttachment). */
export interface RoomSocket {
  /** Stable identity of the underlying connection. */
  readonly key: object;
  meta: SocketMeta;
  send(text: string): void;
  close(code: number, reason: string): void;
}

export type PlayerSlot = PlayerInfo & { slot: number; connected: boolean; disconnectedAt: number | null };

/** Plain JSON, saved to Durable Object storage after every change. */
export type RoomState = {
  code: string;
  created: boolean;
  hostToken: string | null;
  maxPlayers: number;
  players: PlayerSlot[];
  hostGoneAt: number | null;
  closed: boolean;
};

export function newRoomState(code: string): RoomState {
  return {
    code,
    created: false,
    hostToken: null,
    maxPlayers: MAX_PLAYERS,
    players: [],
    hostGoneAt: null,
    closed: false,
  };
}

export type RoomOptions = {
  /** All sockets currently connected to this room. */
  sockets: () => RoomSocket[];
  now?: () => number;
  random?: RandomBytes;
  /** Called after any change to the state, so the host can save it. */
  onStateChange?: (state: RoomState) => void;
  /** Keep this many recent samples per player for the dev admin API. 0 turns it off. */
  sampleBufferSize?: number;
};

type Bucket = { tokens: number; at: number; warnedAt: number };

export class Room {
  private readonly buckets = new WeakMap<object, Bucket>();
  private readonly samples = new Map<string, Sample[]>();
  private readonly now: () => number;

  constructor(
    readonly state: RoomState,
    private readonly opts: RoomOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  get code(): string {
    return this.state.code;
  }

  /** True if a host owns this code, so a new room must not reuse it. */
  isTaken(): boolean {
    if (this.state.closed) return false;
    return this.state.created || this.opts.sockets().some((s) => s.meta.role === "host");
  }

  handleMessage(socket: RoomSocket, raw: string): void {
    if (!this.allow(socket)) return;
    if (socket.meta.role === "host") this.onHostMessage(socket, raw);
    else this.onPlayerMessage(socket, raw);
  }

  handleClose(socket: RoomSocket): void {
    const meta = socket.meta;
    if (meta.role === "host") {
      if (!meta.authed || this.state.closed) return;
      const otherHost = this.opts
        .sockets()
        .some((s) => s.key !== socket.key && s.meta.role === "host" && s.meta.authed);
      if (!otherHost) {
        this.state.hostGoneAt = this.now();
        this.changed();
      }
      return;
    }
    if (meta.retired || !meta.playerId) return;
    const player = this.findPlayer(meta.playerId);
    if (player && player.connected) {
      player.connected = false;
      player.disconnectedAt = this.now();
      this.changed();
    }
  }

  /** Earliest time `alarm()` has work to do, or null. */
  nextAlarm(): number | null {
    let next: number | null = null;
    const consider = (t: number) => {
      if (next === null || t < next) next = t;
    };
    for (const sock of this.opts.sockets()) {
      if (waitingToJoin(sock.meta) && sock.meta.since !== undefined)
        consider(sock.meta.since + JOIN_TIMEOUT_MS);
    }
    if (this.state.closed) return next;
    for (const p of this.state.players) {
      if (!p.connected && p.disconnectedAt !== null) consider(p.disconnectedAt + PLAYER_GRACE_MS);
    }
    if (this.state.hostGoneAt !== null) consider(this.state.hostGoneAt + HOST_GRACE_MS);
    return next;
  }

  /** Frees expired player slots and closes the room if the host has been gone too long. */
  alarm(): void {
    const now = this.now();
    for (const sock of this.opts.sockets()) {
      const since = sock.meta.since;
      if (waitingToJoin(sock.meta) && since !== undefined && now - since >= JOIN_TIMEOUT_MS) {
        // Mark it first so its close event does nothing, then close.
        sock.meta =
          sock.meta.role === "host"
            ? { role: "host", authed: false }
            : { role: "player", playerId: null, retired: true };
        sock.close(CLOSE.joinTimeout, "join timeout");
      }
    }
    if (this.state.closed) return;
    const expired = this.state.players.filter(
      (p) => !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= PLAYER_GRACE_MS,
    );
    if (expired.length > 0) {
      this.state.players = this.state.players.filter((p) => !expired.includes(p));
      for (const p of expired) {
        this.samples.delete(p.playerId);
        this.toHost({ v: 1, type: "player_left", playerId: p.playerId, reason: "timeout" });
      }
      this.changed();
    }
    if (this.state.hostGoneAt !== null && now - this.state.hostGoneAt >= HOST_GRACE_MS) {
      this.closeRoom("The host left the séance.");
    }
  }

  // ---------- Dev admin helpers (used by the Node relay for the Séance MCP) ----------

  players(): readonly PlayerSlot[] {
    return this.state.players;
  }

  hostConnected(): boolean {
    return this.hostSocket() !== undefined;
  }

  /** Recent samples of one player, oldest first. */
  recentSamples(playerId: string, opts: { seconds?: number; sinceT?: number } = {}): Sample[] {
    const buffer = this.samples.get(playerId) ?? [];
    const last = buffer[buffer.length - 1];
    if (!last) return [];
    if (opts.sinceT !== undefined) {
      const since = opts.sinceT;
      return buffer.filter((s) => s.t > since);
    }
    if (opts.seconds !== undefined) {
      const from = last.t - opts.seconds * 1000;
      return buffer.filter((s) => s.t >= from);
    }
    return [...buffer];
  }

  /** Sends a gesture to the host as if this player made it. Returns false if the player is unknown. */
  injectGesture(playerId: string, event: GestureEvent): boolean {
    if (!this.findPlayer(playerId)) return false;
    this.toHost({ v: 1, type: "gesture", playerId, event });
    return true;
  }

  // ---------- Host messages ----------

  private onHostMessage(socket: RoomSocket, raw: string): void {
    const result = hostToRelay.decode(raw);
    if (!result.ok) return this.sendError(socket, result.error.code, result.error.message);
    const m = result.message;
    const meta = socket.meta as Extract<SocketMeta, { role: "host" }>;

    switch (m.type) {
      case "ping":
        return this.sendHost(socket, { v: 1, type: "pong", t: m.t });
      case "pong":
        return;
      case "create_room": {
        if (this.state.created || this.state.closed) {
          return this.sendError(socket, "not_allowed", "This room already exists.");
        }
        this.state.created = true;
        this.state.hostToken = randomId(32, this.opts.random);
        this.state.maxPlayers = m.maxPlayers ?? MAX_PLAYERS;
        socket.meta = { role: "host", authed: true };
        this.changed();
        return this.sendRoomReady(socket);
      }
      case "resume_room": {
        const token = this.state.hostToken;
        if (
          !this.state.created ||
          this.state.closed ||
          token === null ||
          m.roomCode !== this.state.code ||
          !safeEqual(m.hostToken, token)
        ) {
          this.sendError(socket, "not_allowed", "Cannot resume this room.");
          return socket.close(CLOSE.notAllowed, "not allowed");
        }
        for (const other of this.opts.sockets()) {
          if (other.key !== socket.key && other.meta.role === "host") {
            other.meta = { role: "host", authed: false };
            other.close(CLOSE.replaced, "Replaced by a new host connection");
          }
        }
        socket.meta = { role: "host", authed: true };
        this.state.hostGoneAt = null;
        this.changed();
        return this.sendRoomReady(socket);
      }
      case "feedback":
      case "ui": {
        if (!meta.authed) return this.sendError(socket, "not_allowed", "Create or resume a room first.");
        const out: RelayToPhoneMessage =
          m.type === "feedback"
            ? { v: 1, type: "feedback", feedback: m.feedback }
            : { v: 1, type: "ui", ui: m.ui };
        for (const target of this.playerSockets()) {
          const id = (target.meta as { playerId: string }).playerId;
          if (m.to === "all" || m.to === id) this.sendPhone(target, out);
        }
        return;
      }
    }
  }

  private sendRoomReady(socket: RoomSocket): void {
    this.sendHost(socket, {
      v: 1,
      type: "room_ready",
      roomCode: this.state.code,
      hostToken: this.state.hostToken!,
      players: this.state.players.map(toPlayerInfo),
    });
  }

  // ---------- Phone messages ----------

  private onPlayerMessage(socket: RoomSocket, raw: string): void {
    const result = phoneToRelay.decode(raw);
    if (!result.ok) return this.sendError(socket, result.error.code, result.error.message);
    const m = result.message;
    const meta = socket.meta as Extract<SocketMeta, { role: "player" }>;

    if (m.type === "ping") return this.sendPhone(socket, { v: 1, type: "pong", t: m.t });
    if (m.type === "pong") return;

    if (m.type === "join") {
      if (meta.playerId || meta.retired) return this.sendError(socket, "not_allowed", "Already joined.");
      if (!this.state.created || this.state.closed || m.roomCode !== this.state.code) {
        this.sendError(socket, "room_not_found", "That room doesn't exist. Check the code.");
        return socket.close(CLOSE.roomNotFound, "room not found");
      }
      const existing = m.playerId ? this.findPlayer(m.playerId) : undefined;
      if (existing) {
        for (const old of this.playerSockets(existing.playerId)) {
          if (old.key === socket.key) continue;
          old.meta = { role: "player", playerId: null, retired: true };
          old.close(CLOSE.replaced, "Replaced by a new connection");
        }
        existing.connected = true;
        existing.disconnectedAt = null;
        socket.meta = { role: "player", playerId: existing.playerId };
        this.changed();
        return this.sendWelcome(socket, existing);
      }
      if (this.state.players.length >= this.state.maxPlayers) {
        this.sendError(socket, "room_full", "This séance is full.");
        return socket.close(CLOSE.roomFull, "room full");
      }
      const slot = this.freeSlot();
      const player: PlayerSlot = {
        playerId: randomId(16, this.opts.random),
        name: m.name.trim(),
        color: PLAYER_COLORS[slot % PLAYER_COLORS.length]!,
        device: m.device,
        slot,
        connected: true,
        disconnectedAt: null,
      };
      this.state.players.push(player);
      socket.meta = { role: "player", playerId: player.playerId };
      this.changed();
      this.sendWelcome(socket, player);
      return this.toHost({ v: 1, type: "player_joined", player: toPlayerInfo(player) });
    }

    const playerId = meta.playerId;
    if (!playerId || meta.retired) return this.sendError(socket, "not_allowed", "Join the room first.");

    if (m.type === "sensor_frames") {
      this.bufferSamples(playerId, m.samples);
      return this.toHost({ v: 1, type: "sensor_frames", playerId, samples: m.samples });
    }
    // m.type === "gesture"
    return this.toHost({ v: 1, type: "gesture", playerId, event: m.event });
  }

  private sendWelcome(socket: RoomSocket, player: PlayerSlot): void {
    this.sendPhone(socket, {
      v: 1,
      type: "welcome",
      playerId: player.playerId,
      color: player.color,
      roomCode: this.state.code,
    });
  }

  // ---------- Helpers ----------

  private allow(socket: RoomSocket): boolean {
    const now = this.now();
    let bucket = this.buckets.get(socket.key);
    if (!bucket) {
      bucket = { tokens: RATE_LIMIT_PER_SECOND, at: now, warnedAt: -Infinity };
      this.buckets.set(socket.key, bucket);
    }
    bucket.tokens = Math.min(
      RATE_LIMIT_PER_SECOND,
      bucket.tokens + (Math.max(0, now - bucket.at) / 1000) * RATE_LIMIT_PER_SECOND,
    );
    bucket.at = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    if (now - bucket.warnedAt >= 1000) {
      bucket.warnedAt = now;
      this.sendError(socket, "rate_limited", "Too many messages. Slow down.");
    }
    return false;
  }

  private closeRoom(message: string): void {
    this.state.closed = true;
    for (const s of this.playerSockets()) {
      this.sendPhone(s, { v: 1, type: "error", code: "room_not_found", message });
      s.close(CLOSE.roomNotFound, "room closed");
    }
    this.samples.clear();
    this.changed();
  }

  private freeSlot(): number {
    const used = new Set(this.state.players.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  private findPlayer(playerId: string): PlayerSlot | undefined {
    return this.state.players.find((p) => p.playerId === playerId);
  }

  private hostSocket(): RoomSocket | undefined {
    return this.opts.sockets().find((s) => s.meta.role === "host" && s.meta.authed);
  }

  /** Joined, non-retired player sockets, optionally for one player. */
  private playerSockets(playerId?: string): RoomSocket[] {
    return this.opts.sockets().filter((s) => {
      const meta = s.meta;
      return (
        meta.role === "player" &&
        !meta.retired &&
        meta.playerId !== null &&
        (playerId === undefined || meta.playerId === playerId)
      );
    });
  }

  private bufferSamples(playerId: string, samples: Sample[]): void {
    const size = this.opts.sampleBufferSize ?? 0;
    if (size <= 0) return;
    const buffer = this.samples.get(playerId) ?? [];
    buffer.push(...samples);
    if (buffer.length > size) buffer.splice(0, buffer.length - size);
    this.samples.set(playerId, buffer);
  }

  private toHost(message: RelayToHostMessage): void {
    const host = this.hostSocket();
    if (host) this.sendHost(host, message);
  }

  private sendHost(socket: RoomSocket, message: RelayToHostMessage): void {
    safeSend(socket, relayToHost.encode(message));
  }

  private sendPhone(socket: RoomSocket, message: RelayToPhoneMessage): void {
    safeSend(socket, relayToPhone.encode(message));
  }

  private sendError(socket: RoomSocket, code: ErrorCode, message: string): void {
    const m = { v: 1 as const, type: "error" as const, code, message: message.slice(0, 200) };
    safeSend(socket, socket.meta.role === "host" ? relayToHost.encode(m) : relayToPhone.encode(m));
  }

  private changed(): void {
    this.opts.onStateChange?.(this.state);
  }
}

function toPlayerInfo(p: PlayerSlot): PlayerInfo {
  return { playerId: p.playerId, name: p.name, color: p.color, device: p.device };
}

function safeSend(socket: RoomSocket, text: string): void {
  try {
    socket.send(text);
  } catch {
    // The socket is already closing. Its close event will clean up.
  }
}
