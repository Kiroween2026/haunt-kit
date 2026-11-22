// Tests the DEPLOYED sites. Skipped unless LIVE=1. Run before submitting:
//   LIVE=1 pnpm exec playwright test e2e/live.spec.ts --project=chromium --project=webkit
import { expect, test } from "@playwright/test";

const PLAY = process.env.LIVE_PLAY ?? "https://staging.haunt-kit-play.pages.dev/";
const PARTY = process.env.LIVE_PARTY ?? "https://staging.haunt-kit-seance.pages.dev/";
const STEADY = process.env.LIVE_STEADY ?? "https://staging.haunt-kit-steady.pages.dev/";

test.skip(!process.env.LIVE, "set LIVE=1 to test the deployed sites");

test("Séance Party connects to the live relay and shows a room code and QR code", async ({ page }) => {
  await page.goto(PARTY);
  await expect(page.getByRole("heading", { name: "Join with your phone" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".hk-qr__room")).toHaveText(/^[A-Z]{4}$/);
  await expect(page.locator(".hk-qr__code-image svg")).toBeVisible();
  // The QR code points at the live phone controller, not at localhost.
  const url = (await page.locator(".hk-qr__url").textContent())!;
  // Exactly this deployment's controller: staging's address would not contain the production one.
  expect(url).toContain(`${PLAY}?room=`);
  expect(url).not.toContain("localhost");
});

test("a person joins the live game from the live controller, and a whole bots game starts", async ({
  browser,
}) => {
  const host = await (await browser.newContext()).newPage();
  await host.goto(PARTY);
  await expect(host.getByRole("heading", { name: "Join with your phone" })).toBeVisible({ timeout: 20_000 });
  const code = (await host.locator(".hk-qr__room").textContent())!.trim();
  const link = await host.getByRole("link", { name: "Join from this computer" }).getAttribute("href");
  expect(link).toBe(`${PLAY}sim.html?room=${code}`);

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link!);
  await guest.getByLabel("Your name").fill("Live Ghost");
  await guest.getByRole("button", { name: "Join with this computer" }).click();
  await expect(host.getByText("Ghosts (1 of 8)")).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByRole("heading", { name: "You're in!" })).toBeVisible();

  await host.getByRole("button", { name: "Fill to 4" }).click();
  await host.getByRole("button", { name: "Start the séance" }).click();
  await expect(guest.getByRole("heading", { name: "Ouija Planchette" })).toBeVisible({ timeout: 15_000 });
  await expect(host.getByRole("img", { name: /Ouija board/ })).toBeVisible({ timeout: 20_000 });
  await host.context().close();
  await guest.context().close();
});

test("the live phone controller shows its join screen", async ({ page }) => {
  await page.goto(`${PLAY}?room=ABCD`);
  await expect(page.getByRole("heading", { name: /Join the séance/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play without a phone" })).toBeVisible();
});

test("a wrong room code on the live controller says so", async ({ page }) => {
  await page.goto(`${PLAY}sim.html?room=ZZZZ`);
  await page.getByRole("button", { name: "Join with this computer" }).click();
  await expect(page.getByRole("heading", { name: "Couldn't join" })).toBeVisible({ timeout: 20_000 });
});

test("live Steady runs a demo session and saves it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${STEADY}?speed=8`);
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByRole("button", { name: "Shoulder raise" }).click();
  await page.getByRole("button", { name: /Try the demo/ }).click();
  await expect(page.getByLabel("5 reps")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Saved on this phone.")).toBeVisible();
});

test("live Séance Party works in practice mode when the relay is skipped", async ({ page }) => {
  await page.goto(`${PARTY}?practice=1&speed=12`);
  await page.getByRole("button", { name: "Fill to 4" }).click();
  await page.getByRole("button", { name: "Start the séance" }).click();
  await expect(page.getByRole("heading", { name: /standing/ })).toBeVisible({ timeout: 90_000 });
});
