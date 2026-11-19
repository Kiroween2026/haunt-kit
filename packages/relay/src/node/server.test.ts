import { afterEach, describe, expect, it, vi } from "vitest";
import { startNodeRelay, type NodeRelay } from "./server";
import { smokeTest } from "./smoke";

let relay: NodeRelay | null = null;
afterEach(async () => {
  await relay?.close();
  relay = null;
});

const TOKEN = "test-token-0123456789abcdef";

describe("Node relay over real WebSockets", () => {
  it("passes the full smoke test", async () => {
    relay = await startNodeRelay({ port: 0 });
    const steps = await smokeTest(relay.wsUrl);
    expect(steps).toHaveLength(7);
  });

  it("health works and admin is off without a token", async () => {
    relay = await startNodeRelay({ port: 0 });
    expect(await (await fetch(`${relay.url}/health`)).json()).toEqual({ ok: true, admin: false });
    expect((await fetch(`${relay.url}/admin/rooms`)).status).toBe(404);
  });

  it("admin is off in production even with a token", async () => {
    relay = await startNodeRelay({ port: 0, devToken: TOKEN, production: true });
    const res = await fetch(`${relay.url}/admin/rooms`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(404);
  });

  it("admin needs the right token", async () => {
    relay = await startNodeRelay({ port: 0, devToken: TOKEN });
    expect((await fetch(`${relay.url}/admin/rooms`)).status).toBe(401);
    const wrong = await fetch(`${relay.url}/admin/rooms`, { headers: { authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
    const ok = await fetch(`${relay.url}/admin/rooms`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual([]);
  });

  it("rejects WebSocket paths other than /host and /join", async () => {
    relay = await startNodeRelay({ port: 0 });
    const ws = new WebSocket(`${relay.wsUrl}/nope`);
    const result = await new Promise<string>((r) => {
      ws.onopen = () => r("open");
      ws.onerror = () => r("error");
    });
    expect(result).toBe("error");
  });
});

describe("security", () => {
  it("never enables admin on a non-loopback host, even with a token", async () => {
    relay = await startNodeRelay({ port: 0, host: "0.0.0.0", devToken: TOKEN });
    expect(relay.adminEnabled).toBe(false);
  });

  it("closes a WebSocket that never joins (join timeout)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      relay = await startNodeRelay({ port: 0 });
      const ws = new WebSocket(`${relay.wsUrl}/join?room=ABCD`);
      const code = new Promise<number>((r) => (ws.onclose = (e) => r(e.code)));
      await new Promise<void>((r) => (ws.onopen = () => r()));
      await vi.advanceTimersByTimeAsync(10_500);
      vi.useRealTimers();
      expect(await code).toBe(4008);
    } finally {
      vi.useRealTimers();
    }
  });
});
