// Owner: Anish (built by Yadnesh while Anish is unavailable).
// Where samples come from: the phone's sensors, or the demo.
import { KeepAwake, MotionSampler, requestSensorAccess, SAMPLE_HZ } from "@haunt-kit/host-sdk";
import type { Sample } from "@haunt-kit/protocol";
import { demoSamples } from "./demo";
import type { Exercise } from "./exercises";

export type StartResult = { ok: true } | { ok: false; reason: "denied" | "no-sensors" };

export interface SampleSource {
  /** Must be called from the Start tap (iPhone asks for motion permission only then). */
  start(onSample: (s: Sample) => void): Promise<StartResult>;
  stop(): void;
}

/** The phone's motion sensors, with the screen kept awake. */
export function motionSource(): SampleSource {
  const sampler = new MotionSampler();
  const awake = new KeepAwake();
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    async start(onSample) {
      // The permission request and the wake lock both start inside the tap, before any await.
      const access = requestSensorAccess({ mic: false });
      void awake.enable();
      const result = await access;
      if (result.motion === "denied") return { ok: false, reason: "denied" };
      if (result.motion === "unsupported") return { ok: false, reason: "no-sensors" };
      sampler.start();
      timer = setInterval(() => {
        const s = sampler.read(performance.now());
        if (s) onSample(s);
      }, 1000 / SAMPLE_HZ);
      // A desktop browser says "granted" but never sends motion events.
      return new Promise<StartResult>((resolve) =>
        setTimeout(
          () => resolve(sampler.receiving ? { ok: true } : { ok: false, reason: "no-sensors" }),
          1500,
        ),
      );
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      sampler.stop();
      awake.disable();
    },
  };
}

/** A pretend person, in real time (or faster, with `speed`). */
export function demoSource(exercise: Exercise, speed = 1): SampleSource {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    async start(onSample) {
      const samples = demoSamples(exercise);
      const begun = performance.now();
      let i = 0;
      timer = setInterval(() => {
        const elapsed = (performance.now() - begun) * speed;
        while (i < samples.length && samples[i]!.t <= elapsed) onSample(samples[i++]!);
        if (i >= samples.length && timer) {
          clearInterval(timer);
          timer = null;
        }
      }, 1000 / SAMPLE_HZ);
      return { ok: true };
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
