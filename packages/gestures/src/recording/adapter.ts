// Owner: Anish. Adapter for host-sdk MockTransport.
// Connects Ghost Recordings and ReplayPlayer to simulated player sessions.

import type { Sample } from "@haunt-kit/protocol";
import type { GhostRecording } from "./schema";
import { ReplayPlayer } from "./player";

/**
 * Adapter interface consumed by @haunt-kit/host-sdk MockTransport.
 * Represents a simulated or replaying phone player in a room.
 */
export interface GhostPlayerAdapter {
  /** Unique player identifier */
  readonly id: string;
  /** Human-readable display name */
  readonly name: string;
  /** Whether the ghost player is currently replaying samples */
  readonly isPlaying: boolean;
  /** Starts replaying samples to the provided callback */
  start(onSample: (sample: Sample) => void, onComplete?: () => void): void;
  /** Stops playback immediately */
  stop(): void;
}

/**
 * Configuration options for creating a ghost player adapter.
 */
export interface GhostPlayerOptions {
  /** Playback speed multiplier (e.g. 0.5, 1.0, 2.0). Defaults to 1.0 */
  speed?: number;
  /** Whether to repeat the recording continuously. Defaults to false */
  loop?: boolean;
}

/**
 * Creates a GhostPlayerAdapter wrapping a validated GhostRecording.
 * Delegates all timing and sample scheduling directly to ReplayPlayer.
 */
export function createGhostPlayer(
  id: string,
  name: string,
  recording: GhostRecording,
  options?: GhostPlayerOptions,
): GhostPlayerAdapter {
  const player = new ReplayPlayer(recording);

  return {
    get id() {
      return id;
    },
    get name() {
      return name;
    },
    get isPlaying() {
      return player.isPlaying;
    },
    start(onSample: (sample: Sample) => void, onComplete?: () => void): void {
      player.playRealtime({
        onSample,
        onComplete,
        speed: options?.speed,
        loop: options?.loop,
      });
    },
    stop(): void {
      player.stop();
    },
  };
}
