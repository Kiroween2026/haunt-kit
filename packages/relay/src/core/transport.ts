// Owner: Yadnesh. The smallest WebSocket-like interface the host-sdk and controller need.
// Real browsers and Node 22+ use WebSocket; tests and the MockTransport use the in-memory relay.

export interface Transport {
  send(text: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((text: string) => void) | null;
  onclose: ((code: number, reason: string) => void) | null;
}

export type TransportFactory = (url: string) => Transport;

/** Uses the global WebSocket (browsers, Node 22+, Workers). */
export const webSocketTransport: TransportFactory = (url) => {
  const ws = new WebSocket(url);
  const t: Transport = {
    send: (text) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
    },
    close: () => ws.close(1000, "bye"),
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.onopen = () => t.onopen?.();
  ws.onmessage = (e) => {
    if (typeof e.data === "string") t.onmessage?.(e.data);
  };
  ws.onclose = (e) => t.onclose?.(e.code, e.reason);
  return t;
};

/**
 * Builds a relay endpoint URL. `base` may be http(s) or ws(s) and may have a path prefix,
 * e.g. "https://example.com/relay" → "wss://example.com/relay/join?room=ABCD".
 */
export function relayEndpoint(base: string, path: "host" | "join", room?: string): string {
  const url = new URL(base);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  url.pathname = url.pathname.replace(/\/+$/, "") + "/" + path;
  url.search = "";
  if (room) url.searchParams.set("room", room);
  return url.toString();
}
