// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Connects to the relay. If there's no relay (a judge opening the page alone), falls back to a
// practice room with no phones, so the game still works with bots.
import { createMockRoom, createRoom, type HauntRoom } from "@haunt-kit/host-sdk";

export type Mode = "live" | "practice";

export type Config = {
  relayUrl: string;
  controllerUrl: string;
  forcePractice: boolean;
  /** Runs the clock faster. For tests and demos only. */
  speed: number;
};

export function readConfig(
  search: string,
  env: { VITE_RELAY_URL?: string; VITE_CONTROLLER_URL?: string },
): Config {
  const q = new URLSearchParams(search);
  const speed = Number(q.get("speed"));
  return {
    relayUrl: q.get("relay") ?? env.VITE_RELAY_URL ?? "ws://127.0.0.1:8787",
    controllerUrl: q.get("play") ?? env.VITE_CONTROLLER_URL ?? "http://localhost:5180/",
    forcePractice: q.get("practice") === "1",
    speed: Number.isFinite(speed) && speed >= 1 && speed <= 60 ? speed : 1,
  };
}

export async function connect(config: Config): Promise<{ room: HauntRoom; mode: Mode }> {
  if (!config.forcePractice) {
    try {
      const room = await createRoom({
        relayUrl: config.relayUrl,
        controllerUrl: config.controllerUrl,
        timeoutMs: 4000,
      });
      return { room, mode: "live" };
    } catch {
      // No relay: practice mode below.
    }
  }
  return { room: await createMockRoom({ controllerUrl: config.controllerUrl }), mode: "practice" };
}
