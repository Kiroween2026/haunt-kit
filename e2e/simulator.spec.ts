import { expect, test } from "@playwright/test";
import { CONTROLLER, hostRoom, until } from "./helpers";

test("the desktop simulator joins like a phone: tilt frames and key gestures reach the host", async ({
  page,
}) => {
  const { room, got } = await hostRoom();
  try {
    await page.goto(`${CONTROLLER}sim.html?room=${room.code}`);
    await page.getByLabel("Your name").fill("Desk Ghost");
    await page.getByRole("button", { name: "Join with this computer" }).click();
    await until(() => got.player_joined.length === 1, 15_000, "player_joined");
    expect(got.player_joined[0]).toMatchObject({ name: "Desk Ghost", device: { os: "desktop" } });
    const id = got.player_joined[0]!.playerId;

    // Tilt view: moving the mouse to the right edge tilts right (gamma > 0).
    room.setUi("all", { view: "tilt", title: "Steer the planchette" });
    await expect(page.getByRole("heading", { name: "Steer the planchette" })).toBeVisible();
    const pad = page.getByLabel("Tilt area: move the mouse here");
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.98, box.y + box.height / 2, { steps: 5 });
    await until(() => got.frames.some((f) => f.samples.some((s) => s.gamma > 35)), 10_000, "tilted frames");
    expect(got.frames.every((f) => f.playerId === id)).toBe(true);

    // Keys fire gestures.
    await page.keyboard.press("s");
    await page.keyboard.press(" ");
    await until(
      () => ["shake", "tap"].every((n) => got.gesture.some((g) => g.event.name === n)),
      10_000,
      "gestures",
    );

    // Feedback from the host reaches the page without errors.
    room.sendFeedback(id, { kind: "flash", color: "#ff0000" });
  } finally {
    room.close();
  }
});

test("the phone controller shows its join screen and links to the simulator", async ({ page }) => {
  await page.goto(`${CONTROLLER}?room=ABCD`);
  await expect(page.getByRole("heading", { name: /Join the séance/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter the séance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play without a phone" })).toHaveAttribute(
    "href",
    "sim.html?room=ABCD",
  );
});

test("a wrong room code shows a clear message", async ({ page }) => {
  await page.goto(`${CONTROLLER}sim.html?room=ZZZZ`);
  await page.getByRole("button", { name: "Join with this computer" }).click();
  await expect(page.getByRole("heading", { name: "Couldn't join" })).toBeVisible({ timeout: 15_000 });
});
