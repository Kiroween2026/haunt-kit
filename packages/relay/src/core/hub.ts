// Owner: Yadnesh. Many rooms in one process: the Node relay and the in-memory relay.

import { generateRoomCode, normalizeRoomCode, type GestureEvent, type Sample } from "@haunt-kit/protocol";
import { Room, newRoomState, type PlayerSlot, type RoomSocket, type SocketMeta } from "./room";

/** What a hub needs from one real connection. */
export interface Conn {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/** What a transport calls into for one connection. */
export interface HubConnection {
  message(raw: string): void;
  closed(): void;
}

type Entry = { room: Room; sockets: Set<RoomSocket>; timer: ReturnType<typeof setTimeout> | null };

export type RoomSummary = { code: string; players: number; connected: number; hostConnected: boolean };
export type DeviceSummary = Omit<PlayerSlot, "slot"> & {
  lastSampleT: number | null;
  sampleRateHz: number | null;
};

export type HubOptions = {
  /** Recent samples kept per player for the dev admin API. Default 0 (off). */
  sampleBufferSize?: number;
};

export class RelayHub {
  private readonly rooms = new Map<string, Entry>();

  constructor(private readonly opts: HubOptions = {}) {}

  /** A host connection. With `resumeCode` it can only resume that room. */
  openHost(conn: Conn, resumeCode?: string): HubConnection {
    if (resumeCode !== undefined) {
      const code = normalizeRoomCode(resumeCode);
      const entry = code ? this.rooms.get(code) : undefined;
      return this.attach(entry ?? this.detached(code ?? "AAAA"), conn, { role: "host", authed: false });
    }
    let code = generateRoomCode();
    for (let i = 0; i < 100 && this.rooms.has(code); i++) code = generateRoomCode();
    const entry = this.makeEntry(code);
    this.rooms.set(code, entry);
    return this.attach(entry, conn, { role: "host", authed: false });
  }

  /** A phone connection. Unknown rooms still connect; their join gets room_not_found. */
  openPlayer(conn: Conn, roomCode: string): HubConnection {
    const code = normalizeRoomCode(roomCode);
    const entry = code ? this.rooms.get(code) : undefined;
    return this.attach(entry ?? this.detached(code ?? "AAAA"), conn, { role: "player", playerId: null });
  }

  listRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((e) => e.room.state.created && !e.room.state.closed)
      .map((e) => ({
        code: e.room.code,
        players: e.room.players().length,
        connected: e.room.players().filter((p) => p.connected).length,
        hostConnected: e.room.hostConnected(),
      }));
  }

  devices(code: string): DeviceSummary[] | null {
    const entry = this.rooms.get(code);
    if (!entry) return null;
    return entry.room.players().map(({ slot: _slot, ...p }) => {
      const recent = entry.room.recentSamples(p.playerId, { seconds: 2 });
      const first = recent[0];
      const last = recent[recent.length - 1];
      const span = first && last ? last.t - first.t : 0;
      return {
        ...p,
        lastSampleT: last?.t ?? null,
        sampleRateHz: span > 0 ? Math.round(((recent.length - 1) * 1000) / span) : null,
      };
    });
  }

  samples(code: string, playerId: string, opts: { seconds?: number; sinceT?: number }): Sample[] | null {
    const entry = this.rooms.get(code);
    if (!entry || !entry.room.players().some((p) => p.playerId === playerId)) return null;
    return entry.room.recentSamples(playerId, opts);
  }

  injectGesture(code: string, playerId: string, event: GestureEvent): boolean {
    const entry = this.rooms.get(code);
    if (!entry) return false;
    const ok = entry.room.injectGesture(playerId, event);
    return ok;
  }

  /** Closes all timers. For tests and shutdown. */
  dispose(): void {
    for (const e of this.rooms.values()) if (e.timer) clearTimeout(e.timer);
    this.rooms.clear();
  }

  private makeEntry(code: string): Entry {
    const entry: Entry = { room: null as unknown as Room, sockets: new Set(), timer: null };
    entry.room = new Room(newRoomState(code), {
      sockets: () => [...entry.sockets],
      sampleBufferSize: this.opts.sampleBufferSize ?? 0,
    });
    return entry;
  }

  /** A room that isn't registered: joins fail with room_not_found, resumes with not_allowed. */
  private detached(code: string): Entry {
    return this.makeEntry(code);
  }

  private attach(entry: Entry, conn: Conn, meta: SocketMeta): HubConnection {
    const socket: RoomSocket = {
      key: {},
      meta,
      send: (text) => conn.send(text),
      close: (code, reason) => conn.close(code, reason),
    };
    entry.sockets.add(socket);
    let open = true;
    return {
      message: (raw) => {
        if (!open) return;
        entry.room.handleMessage(socket, raw);
        this.afterEvent(entry);
      },
      closed: () => {
        if (!open) return;
        open = false;
        entry.room.handleClose(socket);
        entry.sockets.delete(socket);
        this.afterEvent(entry);
      },
    };
  }

  private afterEvent(entry: Entry): void {
    const { room } = entry;
    const registered = this.rooms.get(room.code) === entry;
    if (!registered) return;
    if (room.state.closed || (!room.state.created && entry.sockets.size === 0)) {
      if (entry.timer) clearTimeout(entry.timer);
      this.rooms.delete(room.code);
      return;
    }
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    const next = room.nextAlarm();
    if (next !== null) {
      entry.timer = setTimeout(
        () => {
          entry.timer = null;
          room.alarm();
          this.afterEvent(entry);
        },
        Math.max(0, next - Date.now()),
      );
    }
  }
}
