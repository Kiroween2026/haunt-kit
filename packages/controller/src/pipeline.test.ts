import { afterEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import type { ControlView, Detector, Sample } from "@haunt-kit/protocol";
import { CONTROL_VIEWS } from "@haunt-kit/protocol";
import { createMemoryRelay, createRoom } from "@haunt-kit/host-sdk";
import { InputPipeline, chooseInputMode } from "./pipeline";
import { PhoneClient } from "./client";

const s = (t: number, ax = 0): Sample => ({
  t,
  ax,
  ay: 0,
  az: 9.81,
  gx: 0,
  gy: 0,
  gz: 0,
  alpha: 0,
  beta: 0,
  gamma: 0,
});

/** Fake detectors following the frozen Detector interface. */
const fakeShake: Detector<{ threshold: number }> = {
  name: "shake",
  defaults: { threshold: 15 },
  create: (c) => ({
    push: (x) => (Math.abs(x.ax) > c.threshold ? [{ name: "shake", t: x.t }] : []),
    reset: () => {},
  }),
};
const fakeHoldStill: Detector<{ ms: number }> = {
  name: "hold-still",
  defaults: { ms: 500 },
  create: (c) => {
    let since: number | null = null;
    let fired = false;
    return {
      push: (x) => {
        if (Math.abs(x.ax) > 1) {
          since = null;
          const was = fired;
          fired = false;
          return was ? [{ name: "moved", t: x.t }] : [];
        }
        since ??= x.t;
        if (!fired && x.t - since >= c.ms) {
          fired = true;
          return [{ name: "still", t: x.t }];
        }
        return [];
      },
      reset: () => {
        since = null;
        fired = false;
      },
    };
  },
};
const detectors = [fakeShake, fakeHoldStill] as Detector<unknown>[];

function run(p: InputPipeline, samples: Sample[]) {
  let frames = 0;
  const gestures: string[] = [];
  for (const x of samples) {
    const out = p.push(x, x.t);
    frames += out.frames?.length ?? 0;
    gestures.push(...out.gestures.map((g) => g.name));
  }
  return { frames, gestures };
}
const stream = (n: number, ax = (i: number) => (i === 20 ? 30 : 0)) =>
  Array.from({ length: n }, (_, i) => s(i * 33, ax(i)));

describe("chooseInputMode", () => {
  const all = new Set(["shake", "hold-still"]);
  it("maps views to modes", () => {
    expect(chooseInputMode("tilt", all)).toBe("raw");
    expect(chooseInputMode("scream", all)).toBe("raw");
    expect(chooseInputMode("still", all)).toBe("events");
    expect(chooseInputMode("still", new Set())).toBe("raw");
    expect(chooseInputMode("tap", all)).toBe("events");
    expect(chooseInputMode("wait", all)).toBe("off");
  });
  it("?raw=1 streams raw frames in every view", () => {
    for (const v of CONTROL_VIEWS) expect(chooseInputMode(v, all, true)).toBe("raw");
  });
});

describe("InputPipeline", () => {
  it("event mode sends no raw frames, only gestures", () => {
    const p = new InputPipeline(detectors);
    p.setView("still");
    expect(p.inputMode).toBe("events");
    const out = run(p, stream(60));
    expect(out.frames).toBe(0);
    expect(out.gestures).toEqual(expect.arrayContaining(["still", "shake", "moved"]));
  });

  it("hold-still only runs in the still view", () => {
    const quiet = Array.from({ length: 80 }, (_, i) => s(i * 33));
    const p = new InputPipeline(detectors);
    p.setView("tilt");
    expect(run(p, quiet).gestures).not.toContain("still");
    p.setView("still");
    expect(run(p, quiet).gestures).toContain("still");
  });

  it("raw mode sends every sample as frames and still reports gestures", () => {
    const p = new InputPipeline(detectors);
    p.setView("tilt");
    const out = run(p, stream(60));
    expect(out.frames).toBeGreaterThanOrEqual(57); // the last partial batch may still be buffered
    expect(out.gestures).toContain("shake");
  });

  it("wait sends nothing at all", () => {
    const p = new InputPipeline(detectors);
    expect(run(p, stream(60))).toEqual({ frames: 0, gestures: [] });
  });

  it("with no detectors, 'still' falls back to raw so the game still works", () => {
    const p = new InputPipeline([]);
    p.setView("still");
    expect(run(p, stream(30)).frames).toBeGreaterThan(0);
  });

  it("a detector that throws doesn't stop the others", () => {
    const broken: Detector<null> = {
      name: "broken",
      defaults: null,
      create: () => ({
        push: () => {
          throw new Error("x");
        },
        reset: () => {},
      }),
    };
    const p = new InputPipeline([broken as Detector<unknown>, fakeShake as Detector<unknown>]);
    p.setView("tap");
    const orig = console.error;
    console.error = () => {};
    try {
      expect(run(p, stream(30)).gestures).toEqual(["shake"]);
    } finally {
      console.error = orig;
    }
  });

  it("property: in any non-raw view, no frames are ever produced", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ControlView>("still", "tap", "wait"),
        fc.array(fc.double({ min: -40, max: 40, noNaN: true }), { maxLength: 200 }),
        (view, axs) => {
          const p = new InputPipeline(detectors);
          p.setView(view);
          expect(
            run(
              p,
              axs.map((ax, i) => s(i * 33, ax)),
            ).frames,
          ).toBe(0);
        },
      ),
    );
  });
});

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((c) => c()));

describe("phone → relay → host with on-device detection", () => {
  it("in event mode the host receives gestures and zero frames", async () => {
    const relay = createMemoryRelay();
    const room = await createRoom({
      relayUrl: "ws://mem",
      controllerUrl: "https://p.test/",
      transport: relay.transport,
    });
    cleanup.push(() => room.close());
    let frames = 0;
    const gestures: string[] = [];
    room.on("frames", (f) => (frames += f.samples.length));
    room.on("gesture", (g) => gestures.push(g.event.name));
    const data = new Map<string, string>();
    const client = new PhoneClient({
      relayUrl: "ws://mem",
      roomCode: room.code,
      name: "Det",
      device: { os: "ios", browser: "Safari" },
      transport: relay.transport,
      storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    });
    cleanup.push(() => client.stop());
    const pipeline = new InputPipeline(detectors);
    client.on("ui", (ui) => pipeline.setView(ui.view));
    client.start();
    while (client.status.kind !== "joined") await new Promise((r) => setTimeout(r, 5));
    room.setUi("all", { view: "still" });
    while (pipeline.inputMode !== "events") await new Promise((r) => setTimeout(r, 5));
    for (const x of stream(60)) {
      const out = pipeline.push(x, x.t);
      if (out.frames) client.sendFrames(out.frames);
      for (const g of out.gestures) client.sendGesture(g);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(frames).toBe(0);
    expect(gestures).toEqual(expect.arrayContaining(["still", "shake", "moved"]));
  });
});
