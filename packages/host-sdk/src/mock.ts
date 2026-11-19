// Owner: Yadnesh. MockTransport: run an app with no relay and no phones.
// Uses the real relay room logic in memory, so it behaves exactly like the real thing.

import { createMemoryRelay, type MemoryRelay } from "@haunt-kit/relay/core";
import { GhostPlayer, synthRecording, type GhostRecording, type SynthKind } from "./ghost";
import { createRoom, type HauntRoom } from "./session";

const MOCK_RELAY_URL = "ws://mock.haunt-kit.local";

export type MockGhost = {
  name: string;
  /** A recording, or the name of a synthetic one. Default "wander". */
  recording?: GhostRecording | SynthKind;
  speed?: number;
  loop?: boolean;
};

export type MockRelay = {
  /** Pass as `transport` to createRoom, together with `relayUrl`. */
  transport: MemoryRelay["transport"];
  relayUrl: string;
  /** Joins a fake phone to a room. Resolves when it has been welcomed. */
  addGhost(roomCode: string, ghost: MockGhost): Promise<GhostPlayer>;
  /** Simulates a network drop for every connection. The host reconnects on its own; ghosts leave. */
  dropAll(): void;
  memory: MemoryRelay;
};

export function createMockRelay(): MockRelay {
  const memory = createMemoryRelay({ sampleBufferSize: 1800 });
  return {
    memory,
    transport: memory.transport,
    relayUrl: MOCK_RELAY_URL,
    dropAll: memory.dropAll,
    async addGhost(roomCode, ghost) {
      const rec = ghost.recording ?? "wander";
      const recording = typeof rec === "string" ? synthRecording(rec, 8, 30, hash(ghost.name)) : rec;
      const player = new GhostPlayer({
        relayUrl: MOCK_RELAY_URL,
        roomCode,
        name: ghost.name,
        recording,
        transport: memory.transport,
        ...(ghost.speed !== undefined ? { speed: ghost.speed } : {}),
        ...(ghost.loop !== undefined ? { loop: ghost.loop } : {}),
      });
      await player.start();
      return player;
    },
  };
}

export type MockRoom = HauntRoom & {
  relay: MockRelay;
  ghosts: GhostPlayer[];
  addGhost(g: MockGhost): Promise<GhostPlayer>;
};

/**
 * One call for apps: a room with fake players and no relay.
 *   const room = await createMockRoom({ ghosts: [{ name: "Casper" }, { name: "Boo", recording: "shake" }] });
 */
export async function createMockRoom(
  opts: { ghosts?: MockGhost[]; controllerUrl?: string } = {},
): Promise<MockRoom> {
  const relay = createMockRelay();
  const room = await createRoom({
    relayUrl: relay.relayUrl,
    transport: relay.transport,
    controllerUrl: opts.controllerUrl ?? "https://example.invalid/play",
  });
  const ghosts: GhostPlayer[] = [];
  const addGhost = async (g: MockGhost) => {
    const p = await relay.addGhost(room.code, g);
    ghosts.push(p);
    return p;
  };
  for (const g of opts.ghosts ?? []) await addGhost(g);
  const close = room.close.bind(room);
  return Object.assign(room, {
    relay,
    ghosts,
    addGhost,
    close: () => {
      ghosts.forEach((g) => g.stop());
      close();
    },
  });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
