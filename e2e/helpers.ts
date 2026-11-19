import { createRoom, type HauntRoom, type RoomEvents } from "@haunt-kit/host-sdk";

export const RELAY = "ws://127.0.0.1:8787";
export const CONTROLLER = "http://localhost:5180/";

export type Recorder = { [E in keyof RoomEvents]: RoomEvents[E][] };

/** A host room (as an app would create it) that records everything it receives. */
export async function hostRoom(): Promise<{ room: HauntRoom; got: Recorder }> {
  const room = await createRoom({ relayUrl: RELAY, controllerUrl: CONTROLLER });
  const got: Recorder = {
    player_joined: [],
    player_left: [],
    gesture: [],
    frames: [],
    status: [],
    error: [],
  };
  for (const e of Object.keys(got) as (keyof RoomEvents)[]) {
    room.on(e, (p) => (got[e] as unknown[]).push(p));
  }
  return { room, got };
}

export async function until(cond: () => boolean, ms = 10_000, what = "condition"): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
