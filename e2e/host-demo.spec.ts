import { expect, test } from "@playwright/test";

// A host page in a real browser: creates a room on the relay, shows the QR code, and
// receives ghost players. Séance Party and Steady get their own e2e files once they're built.
test("dot demo: room code and QR code appear, ghost players join and move", async ({ page }) => {
  await page.goto("http://localhost:5181/");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/, { timeout: 15_000 });
  await expect(page.locator("#qr svg")).toBeVisible();
  const code = await page.locator("#code").textContent();
  await expect(page.locator("#url")).toContainText(`room=${code}`);

  await page.getByRole("button", { name: "Add ghost player" }).click();
  await page.getByRole("button", { name: "Add ghost player" }).click();
  await expect(page.locator("#players li")).toHaveCount(2);
  await expect(page.locator("#players")).toContainText("Ghost 1");
  await expect(page.locator("#latency")).toContainText("ms");
  await expect(page.locator("#error")).toHaveText("");
});
