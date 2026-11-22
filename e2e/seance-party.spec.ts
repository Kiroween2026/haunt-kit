import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PARTY = "http://localhost:5183/";
const CONTROLLER = "http://localhost:5180/";

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
const problems = async (page: Page) =>
  (await axe(page)).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test.describe("Séance Party, alone with bots (no phones, no relay)", () => {
  test("the lobby works with no relay: practice mode, bots, and no accessibility problems", async ({
    page,
  }) => {
    await page.goto(`${PARTY}?practice=1`);
    await expect(page.getByRole("heading", { level: 1, name: "Séance Party" })).toBeVisible();
    await expect(page.getByText("Practice mode (no phones)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the séance" })).toBeDisabled();

    await page.getByRole("button", { name: "Fill to 4" }).click();
    await expect(page.getByText("Ghosts (4 of 8)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the séance" })).toBeEnabled();
    await page.getByRole("button", { name: "Add a ghost bot" }).click();
    await expect(page.getByText("Ghosts (5 of 8)")).toBeVisible();
    await page.getByRole("button", { name: "Remove Wisp" }).click();
    await expect(page.getByText("Ghosts (4 of 8)")).toBeVisible();
    await page.getByRole("button", { name: "Remove all bots" }).click();
    await expect(page.getByText("Nobody yet")).toBeVisible();

    await page.getByRole("button", { name: "Fill to 4" }).click();
    expect(await problems(page)).toEqual([]);
  });

  test("a whole game, start to winner, with only bots", async ({ page }) => {
    // Intro screens last under a second at this speed, so record every heading that ever appears.
    await page.addInitScript(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      const look = () => document.querySelectorAll("h2").forEach((h) => seen.add(h.textContent ?? ""));
      new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto(`${PARTY}?practice=1&speed=12`);
    await page.getByRole("button", { name: "Fill to 4" }).click();
    await page.getByRole("button", { name: "Start the séance" }).click();

    await expect(page.getByRole("heading", { name: /standing/ })).toBeVisible({ timeout: 90_000 });
    const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
    for (const title of ["Ouija Planchette", "Hold Still", "Banshee Scream-off"])
      expect(seen, `never saw ${title}`).toContain(title);
    expect(seen).toContain("Scores");

    const rows = page.getByRole("table", { name: "Final scores" }).getByRole("row");
    await expect(rows).toHaveCount(5); // header + 4 ghosts
    expect(await problems(page)).toEqual([]);

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.getByRole("button", { name: "Start the séance" })).toBeVisible();
    await expect(page.getByText("Ghosts (4 of 8)")).toBeVisible(); // the bots stay for the next game
  });

  test("the game screens have no accessibility problems", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(`${PARTY}?practice=1&speed=4`);
    await page.getByRole("button", { name: "Fill to 4" }).click();
    await page.getByRole("button", { name: "Start the séance" }).click();
    expect(await problems(page)).toEqual([]); // intro
    await expect(page.getByRole("img", { name: /Ouija board/ })).toBeVisible({ timeout: 20_000 });
    expect(await problems(page)).toEqual([]);
    await expect(page.getByRole("heading", { name: /ghost looks away|turning|sees you/i })).toBeVisible({
      timeout: 60_000,
    });
    expect(await problems(page)).toEqual([]);
    await expect(page.getByRole("heading", { name: /Get ready|SCREAM/ })).toBeVisible({ timeout: 60_000 });
    expect(await problems(page)).toEqual([]);
  });

  test("with reduced motion, nothing on the lobby moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${PARTY}?practice=1`);
    await page.getByRole("button", { name: "Fill to 4" }).click();
    expect(
      await page.evaluate(
        () => document.getAnimations().filter((a) => (a as CSSAnimation).animationName).length,
      ),
    ).toBe(0);
  });
});

test.describe("Séance Party with a real relay and a person on the simulator", () => {
  test("a player joins from the computer, sees the right view for each game, and tilting moves the planchette", async ({
    browser,
  }) => {
    const host = await (await browser.newContext()).newPage();
    await host.goto(`${PARTY}?play=${encodeURIComponent(CONTROLLER)}`);
    await expect(host.getByRole("heading", { name: "Join with your phone" })).toBeVisible({
      timeout: 15_000,
    });
    const code = (await host.locator(".hk-qr__room").textContent())!.trim();
    expect(code).toMatch(/^[A-Z]{4}$/);
    await expect(host.getByText(`Room ${code}`)).toBeVisible();
    await expect(host.locator(".hk-qr__code-image svg")).toBeVisible();
    expect(await problems(host)).toEqual([]);

    // The "no phone" link goes to the simulator for this room.
    const href = await host.getByRole("link", { name: "Join from this computer" }).getAttribute("href");
    expect(href).toBe(`${CONTROLLER}sim.html?room=${code}`);

    const phone = await (await browser.newContext()).newPage();
    await phone.goto(href!);
    await phone.getByLabel("Your name").fill("Desk Ghost");
    await phone.getByRole("button", { name: "Join with this computer" }).click();
    await expect(host.getByText("Ghosts (1 of 8)")).toBeVisible({ timeout: 15_000 });
    await expect(host.getByText("Desk Ghost", { exact: false }).first()).toBeVisible();
    await expect(phone.getByRole("heading", { name: "You're in!" })).toBeVisible();

    // Alone, so no bot pulls the planchette the other way (everyone's tilt is averaged).
    await host.getByRole("button", { name: "Start the séance" }).click();
    await expect(phone.getByRole("heading", { name: "Ouija Planchette" })).toBeVisible({ timeout: 10_000 });

    // Ouija: the phone is told to tilt, and tilting right moves the planchette right.
    await expect(phone.getByRole("heading", { name: /^Spell / })).toBeVisible({ timeout: 15_000 });
    const planchetteX = async () => {
      const t = (await host.locator(".sp-planchette").locator("xpath=..").getAttribute("transform"))!;
      return Number(/translate\(([-\d.e]+)/.exec(t)![1]);
    };
    const before = await planchetteX();
    const pad = phone.getByLabel("Tilt area: move the mouse here");
    const box = (await pad.boundingBox())!;
    await phone.mouse.move(box.x + box.width * 0.99, box.y + box.height / 2, { steps: 4 });
    await host.waitForTimeout(2500);
    expect(await planchetteX()).toBeGreaterThan(before + 0.2);

    await host.context().close();
    await phone.context().close();
  });
});
