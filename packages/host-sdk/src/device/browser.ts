// Owner: Yadnesh. Browser-only sensor code shared by the phone controller and Steady's local mode.
// Nothing here runs in tests; the pure parts it uses (normalize, rms) are tested.

import type { Sample } from "@haunt-kit/protocol";
import {
  detectBrowser,
  detectOs,
  normalizeSample,
  type Os,
  type RawMotion,
  type RawOrientation,
} from "./normalize";
import { rmsOf } from "./rms";

export type Permission = "granted" | "denied" | "unsupported";
export type SensorAccess = { motion: Permission; mic: Permission; stream: MediaStream | null };

type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Call this directly from a tap handler. iOS only allows these requests during a user gesture,
 * so every request is STARTED before the first await.
 */
export function requestSensorAccess(opts: { mic: boolean }): Promise<SensorAccess> {
  const motionApi = (globalThis as { DeviceMotionEvent?: PermissionApi }).DeviceMotionEvent;
  const orientationApi = (globalThis as { DeviceOrientationEvent?: PermissionApi }).DeviceOrientationEvent;

  const motion: Promise<Permission> = !motionApi
    ? Promise.resolve("unsupported")
    : typeof motionApi.requestPermission === "function"
      ? motionApi.requestPermission().then(
          (r) => (r === "granted" ? "granted" : "denied"),
          () => "denied",
        )
      : Promise.resolve("granted"); // Android / desktop: no prompt needed
  const orientation: Promise<unknown> =
    typeof orientationApi?.requestPermission === "function"
      ? orientationApi.requestPermission().catch(() => "denied")
      : Promise.resolve();
  const mic: Promise<MediaStream | null> =
    opts.mic && navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices
          .getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          })
          .catch(() => null)
      : Promise.resolve(null);

  return Promise.all([motion, mic, orientation]).then(([m, stream]) => ({
    motion: m,
    mic: !opts.mic ? "unsupported" : stream ? "granted" : navigator.mediaDevices ? "denied" : "unsupported",
    stream,
  }));
}

export function currentDevice(): { os: Os; browser: string } {
  return { os: detectOs(navigator), browser: detectBrowser(navigator.userAgent) };
}

/** Keeps the latest motion and orientation readings and turns them into Samples on demand. */
export class MotionSampler {
  private motion: RawMotion | null = null;
  private orientation: RawOrientation | null = null;
  private readonly onMotion = (e: DeviceMotionEvent) => {
    this.motion = {
      accelerationIncludingGravity: e.accelerationIncludingGravity,
      rotationRate: e.rotationRate,
    };
  };
  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    this.orientation = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
  };

  constructor(private readonly os: Os = detectOs(navigator)) {}

  start(): void {
    window.addEventListener("devicemotion", this.onMotion);
    window.addEventListener("deviceorientation", this.onOrientation);
  }

  stop(): void {
    window.removeEventListener("devicemotion", this.onMotion);
    window.removeEventListener("deviceorientation", this.onOrientation);
  }

  /** True once the browser has delivered at least one motion event. */
  get receiving(): boolean {
    return this.motion !== null;
  }

  /** A Sample at time `t` (ms), or null before the first motion event. */
  read(t: number, rms?: number): Sample | null {
    if (!this.motion) return null;
    return normalizeSample(t, this.motion, this.orientation, this.os, rms);
  }
}

/** Mic loudness from an AnalyserNode. The audio itself never leaves this object. */
export class MicMeter {
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly buffer: Float32Array<ArrayBuffer>;

  constructor(stream: MediaStream) {
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buffer = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser); // not connected to the speakers
    void this.ctx.resume();
  }

  /** Current loudness, 0..1. */
  rms(): number {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return rmsOf(this.buffer);
  }

  close(): void {
    void this.ctx.close();
  }
}

/** Screen Wake Lock that is taken again when the page becomes visible (Safari drops it on lock). */
export class KeepAwake {
  private sentinel: { release(): Promise<void> } | null = null;
  private wanted = false;
  private readonly onVisible = () => {
    if (this.wanted && document.visibilityState === "visible") void this.acquire();
  };

  get supported(): boolean {
    return "wakeLock" in navigator;
  }

  async enable(): Promise<boolean> {
    this.wanted = true;
    document.addEventListener("visibilitychange", this.onVisible);
    return this.acquire();
  }

  disable(): void {
    this.wanted = false;
    document.removeEventListener("visibilitychange", this.onVisible);
    void this.sentinel?.release();
    this.sentinel = null;
  }

  private async acquire(): Promise<boolean> {
    try {
      const api = (
        navigator as Navigator & {
          wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
        }
      ).wakeLock;
      if (!api) return false;
      this.sentinel = await api.request("screen");
      return true;
    } catch {
      return false;
    }
  }
}
