// Owner: Yadnesh. An in-memory relay: the real Room logic with no network.
// The host-sdk MockTransport and the tests use it.

import { RelayHub, type HubConnection, type HubOptions } from "./hub";
import type { Transport, TransportFactory } from "./transport";

export type MemoryRelay = {
  hub: RelayHub;
  /** Pass to createRoom / PhoneClient. Accepts any URL ending in /host or /join?room=CODE. */
  transport: TransportFactory;
  /** Drops every open connection as if the network failed (close code 1006). */
  dropAll(): void;
};

export function createMemoryRelay(opts: HubOptions = {}): MemoryRelay {
  const hub = new RelayHub(opts);
  const open = new Set<() => void>();

  const transport: TransportFactory = (rawUrl) => {
    const url = new URL(rawUrl);
    const room = url.searchParams.get("room") ?? undefined;
    const isHost = url.pathname.endsWith("/host");
    let state: "connecting" | "open" | "closed" = "connecting";
    let conn: HubConnection | null = null;
    let closedHere = false;

    const finish = (code: number, reason: string) => {
      if (state === "closed") return;
      state = "closed";
      open.delete(drop);
      queueMicrotask(() => {
        conn?.closed();
        t.onclose?.(code, reason);
      });
    };
    const drop = () => finish(1006, "connection lost");

    const t: Transport = {
      send: (text) => {
        if (state !== "open") return;
        queueMicrotask(() => {
          if (state === "open") conn?.message(text);
        });
      },
      close: () => {
        closedHere = true;
        finish(1000, "bye");
      },
      onopen: null,
      onmessage: null,
      onclose: null,
    };

    queueMicrotask(() => {
      if (state !== "connecting") return;
      const c = {
        // Like a real WebSocket, a message sent before the server closes still arrives before onclose.
        // Only a close started by this side stops delivery.
        send: (text: string) => {
          if (state === "closed") return;
          queueMicrotask(() => {
            if (!closedHere) t.onmessage?.(text);
          });
        },
        close: (code: number, reason: string) => finish(code, reason),
      };
      conn = isHost ? hub.openHost(c, room) : hub.openPlayer(c, room ?? "");
      state = "open";
      open.add(drop);
      t.onopen?.();
    });
    return t;
  };

  return { hub, transport, dropAll: () => [...open].forEach((d) => d()) };
}
