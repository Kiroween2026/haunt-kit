import { expect, test } from "@playwright/test";
import { CONTROLLER, hostRoom, until } from "./helpers";

/** Fires the same events a phone's browser fires, at 60 Hz, with a given tilt. */
async function startFakeMotion(page: import("@playwright/test").Page, beta: number, gamma: number) {
  await page.evaluate(
    ([b, g]) => {
      const rad = (d: number) => (d * Math.PI) / 180;
      const accel = {
        x: 9.81 * Math.sin(rad(g)) * Math.cos(rad(b)),
        y: -9.81 * Math.sin(rad(b)),
        z: 9.81 * Math.cos(rad(g)) * Math.cos(rad(b)),
      };
      setInterval(() => {
        const motion = new Event("devicemotion") as Event & Record<string, unknown>;
        Object.assign(motion, {
          accelerationIncludingGravity: accel,
          rotationRate: { alpha: 0, beta: 0, gamma: 0 },
        });
        window.dispatchEvent(motion);
        const orientation = new Event("deviceorientation") as Event & Record<string, unknown>;
        Object.assign(orientation, { alpha: 0, beta: b, gamma: g });
        window.dispatchEvent(orientation);
      }, 16);
    },
    [beta, gamma] as const,
  );
}

test("phone controller: join, tilt view, frames carry the phone's tilt, feedback and wait view", async ({
  page,
}) => {
  const { room, got } = await hostRoom();
  try {
    await page.goto(`${CONTROLLER}?room=${room.code}`);
    await page.getByLabel("Your name").fill("Phone");
    await page.getByRole("button", { name: "Enter the séance" }).click();
    await until(() => got.player_joined.length === 1, 15_000, "player_joined");
    await startFakeMotion(page, 20, -30);

    room.setUi("all", { view: "tilt", title: "Steer!", hint: "<b>not html</b>" });
    await expect(page.getByRole("heading", { name: "Steer!" })).toBeVisible();
    // Host text is shown as text, never as HTML.
    await expect(page.getByText("<b>not html</b>")).toBeVisible();

    await until(() => got.frames.length >= 5, 10_000, "frames");
    const s = got.frames.at(-1)!.samples.at(-1)!;
    expect(s.beta).toBeCloseTo(20);
    expect(s.gamma).toBeCloseTo(-30);
    expect(Math.hypot(s.ax, s.ay, s.az)).toBeCloseTo(9.81, 1);
    // Batches of at most 32, about every 100 ms.
    expect(got.frames.every((f) => f.samples.length <= 32)).toBe(true);

    // Wait view: the phone stops streaming.
    room.setUi("all", { view: "wait" });
    await expect(page.getByRole("heading", { name: "Watch the big screen" })).toBeVisible();
    await page.waitForTimeout(400);
    const before = got.frames.length;
    await page.waitForTimeout(800);
    expect(got.frames.length).toBe(before);

    // Tap view sends tap gestures.
    room.setUi("all", { view: "tap", title: "TAP!" });
    await page.getByRole("button", { name: "TAP!" }).click();
    await until(() => got.gesture.some((g) => g.event.name === "tap"), 5000, "tap");
  } finally {
    room.close();
  }
});

test("phone controller: reload rejoins as the same player", async ({ page }) => {
  const { room, got } = await hostRoom();
  try {
    await page.goto(`${CONTROLLER}?room=${room.code}`);
    await page.getByLabel("Your name").fill("Reloader");
    await page.getByRole("button", { name: "Enter the séance" }).click();
    await until(() => got.player_joined.length === 1, 15_000, "first join");
    await page.reload();
    await page.getByRole("button", { name: "Enter the séance" }).click();
    await page.waitForTimeout(1500);
    expect(got.player_joined).toHaveLength(1);
    expect(room.players).toHaveLength(1);
  } finally {
    room.close();
  }
});
