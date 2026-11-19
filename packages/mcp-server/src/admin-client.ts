// Owner: Yadnesh. Talks to the Node dev relay's admin API. The token is sent as a header and
// never appears in errors or logs.

import type { GestureEvent, Sample } from "@haunt-kit/protocol";
import type { DeviceSummary, RoomSummary } from "@haunt-kit/relay/core";

export class AdminError extends Error {}

export class AdminClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  listRooms(): Promise<RoomSummary[]> {
    return this.get("/admin/rooms");
  }

  devices(roomCode: string): Promise<DeviceSummary[]> {
    return this.get(`/admin/rooms/${enc(roomCode)}/devices`);
  }

  async samples(
    roomCode: string,
    playerId: string,
    q: { seconds?: number; sinceT?: number },
  ): Promise<Sample[]> {
    const params = new URLSearchParams();
    if (q.seconds !== undefined) params.set("seconds", String(q.seconds));
    if (q.sinceT !== undefined) params.set("sinceT", String(q.sinceT));
    const r = await this.get<{ samples: Sample[] }>(
      `/admin/rooms/${enc(roomCode)}/players/${enc(playerId)}/samples?${params}`,
    );
    return r.samples;
  }

  async fireGesture(roomCode: string, playerId: string, event: GestureEvent): Promise<void> {
    await this.request(`/admin/rooms/${enc(roomCode)}/players/${enc(playerId)}/gesture`, {
      method: "POST",
      body: JSON.stringify(event),
      headers: { "content-type": "application/json" },
    });
  }

  private get<T>(path: string): Promise<T> {
    return this.request(path, { method: "GET" }) as Promise<T>;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    if (!this.token) {
      throw new AdminError(
        "No HAUNT_DEV_TOKEN. Run `pnpm dev:token` in the repo, then restart `pnpm dev:relay` and this MCP server.",
      );
    }
    let res: Response;
    try {
      res = await this.fetchImpl(new URL(path, this.baseUrl), {
        ...init,
        headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${this.token}` },
      });
    } catch {
      throw new AdminError(`Can't reach the dev relay at ${this.baseUrl}. Start it with \`pnpm dev:relay\`.`);
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401)
      throw new AdminError(
        "The relay rejected the dev token (401). Restart the relay after `pnpm dev:token`.",
      );
    if (res.status === 404 && path === "/admin/rooms") {
      throw new AdminError(
        "The relay's admin API is off. Start the relay with HAUNT_DEV_TOKEN set (`pnpm dev:token`).",
      );
    }
    if (!res.ok) throw new AdminError(body.error ?? `relay answered ${res.status}`);
    return body;
  }
}

const enc = encodeURIComponent;
