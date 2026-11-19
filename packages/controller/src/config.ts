// Owner: Yadnesh. Where the phone finds its relay and room.

import { normalizeRoomCode } from "@haunt-kit/protocol";

/**
 * Relay URL, in order: ?relay=..., VITE_RELAY_URL at build time, or "<this origin>/relay"
 * (the Vite dev server proxies /relay to the local Node relay, so one cloudflared tunnel is enough).
 */
export function resolveRelayUrl(location: { search: string; origin: string }, envUrl?: string): string {
  const fromQuery = new URLSearchParams(location.search).get("relay");
  if (fromQuery && /^(wss?|https?):\/\//.test(fromQuery)) return fromQuery;
  if (envUrl) return envUrl;
  return `${location.origin}/relay`;
}

export function roomFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get("room");
  return raw ? normalizeRoomCode(raw) : null;
}

/** Motion sensors and the mic only work in a secure context (HTTPS or localhost). */
export function isSecure(location: { protocol: string; hostname: string }): boolean {
  return (
    location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1"
  );
}

/** Player names: trimmed, 1-20 characters. */
export function cleanName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ").slice(0, 20);
  return name.length > 0 ? name : null;
}
