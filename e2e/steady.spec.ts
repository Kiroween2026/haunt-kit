import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const STEADY = "http://localhost:5184/";
const problems = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

/** Records every phrase the app asks the browser to speak. */
const spy = (page: Page) =>
  page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
        if (u.text.trim()) said.push(u.text);
      };
    }
  });
const said = (page: Page) => page.evaluate(() => (window as unknown as { __said: string[] }).__said);

async function acceptDisclaimer(page: Page) {
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("heading", { name: "Pick an exercise" })).toBeVisible();
}

async function runDemo(page: Page, exercise = "Shoulder raise") {
  await page.getByRole("button", { name: exercise }).click();
  await page.getByRole("button", { name: /Try the demo/ }).click();
}

test.describe("Steady", () => {
  test("shows the medical disclaimer first, and only once", async ({ page }) => {
    await page.goto(STEADY);
    await expect(page.getByRole("heading", { level: 1, name: "Before you start" })).toBeVisible();
    await expect(page.getByText("Steady is not a medical device.")).toBeVisible();
    await expect(page.getByText("Nothing is uploaded.")).toBeVisible();
    expect(await problems(page)).toEqual([]);
    await acceptDisclaimer(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Pick an exercise" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Before you start" })).toHaveCount(0);
  });

  test("a whole session with the demo: counts out loud, flags two reps, saves, reports, remembers", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await spy(page);
    await page.goto(`${STEADY}?speed=4`);
    await acceptDisclaimer(page);
    expect(await problems(page)).toEqual([]);

    await page.getByRole("button", { name: "Shoulder raise" }).click();
    await expect(page.getByRole("heading", { name: "How to hold the phone" })).toBeVisible();
    expect(await problems(page)).toEqual([]);
    await page.getByRole("button", { name: /Try the demo/ }).click();

    await expect(page.getByText("Hold still at the start position.")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Setting the start position" })).toBeVisible();
    expect(await problems(page)).toEqual([]);

    const feedback = page.getByRole("status").filter({ hasText: /^Rep \d/ });
    await expect(feedback).toHaveText("Rep 1: Good rep", { timeout: 30_000 });
    expect(await problems(page)).toEqual([]);
    await expect(page.getByRole("meter", { name: "Angle" })).toBeVisible();
    await expect(page.getByText("Aim for 80°")).toBeVisible();
    await expect(page.getByLabel("5 reps")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("heading", { name: "Well done" })).toBeVisible();
    await expect(page.getByText("Saved on this phone.")).toBeVisible();
    const row = (name: string) => page.getByRole("row", { name, exact: true });
    await expect(row("Reps 5")).toBeVisible();
    await expect(row("Reps with full range 3 of 5")).toBeVisible();
    await expect(row("Reps that were too fast 1 of 5")).toBeVisible();
    expect(await problems(page)).toEqual([]);

    // What was said out loud
    const spoken = await said(page);
    expect(spoken.slice(0, 5)).toEqual(["1.", "2.", "3. Go a little higher.", "4. Slow down.", "5."]);
    expect(spoken.at(-1)).toMatch(/^Session finished\. 5 reps\./);

    // The report for the therapist
    await page.getByRole("button", { name: "Report for my therapist" }).click();
    await expect(page.getByRole("article", { name: "Report for my therapist" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Each rep" }).getByRole("row")).toHaveCount(6);
    await expect(page.getByText(/not a medical device and gives no medical advice/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
    expect(await problems(page)).toEqual([]);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    // It is still there after a reload (IndexedDB), and can be deleted.
    await page.reload();
    await page.getByRole("button", { name: "My sessions" }).click();
    await expect(page.getByRole("heading", { name: "Shoulder raise" })).toBeVisible();
    await expect(page.getByText(/5 reps, average \d+°/)).toBeVisible();
    expect(await problems(page)).toEqual([]);
    await page.getByRole("button", { name: /^Delete Shoulder raise/ }).click();
    await expect(page.getByRole("dialog", { name: "Delete this session?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByRole("heading", { name: "Shoulder raise" })).toBeVisible();
    await page.getByRole("button", { name: /^Delete Shoulder raise/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No sessions yet.")).toBeVisible();
  });

  test("the bicep curl works too, and a session with no reps saves nothing", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`${STEADY}?speed=8`);
    await acceptDisclaimer(page);
    await runDemo(page, "Bicep curl");
    await expect(page.getByRole("heading", { name: "Bicep curl (demo)" })).toBeVisible();
    await expect(page.getByText("Aim for 100°")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("heading", { name: "No reps counted" })).toBeVisible();
    await expect(page.getByText("Nothing was saved.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Report for my therapist" })).toHaveCount(0);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "My sessions" }).click();
    await expect(page.getByText("No sessions yet.")).toBeVisible();
  });

  test("works with real motion events from the phone, not only the demo", async ({ page }) => {
    test.setTimeout(90_000);
    await spy(page);
    await page.goto(STEADY);
    await acceptDisclaimer(page);
    await page.getByRole("button", { name: "Shoulder raise" }).click();
    // A pretend arm: still for 2.6 s, then three slow lifts to 90°, sending motion events like a phone does.
    await page.evaluate(() => {
      const t0 = performance.now();
      setInterval(() => {
        const sec = (performance.now() - t0) / 1000 - 2.6;
        const rep = 2.6;
        const u = sec >= 0 && sec < 3 * (rep + 1) ? (sec % (rep + 1)) / rep : 2;
        const deg = u < 1 ? (90 * (1 - Math.cos(2 * Math.PI * u))) / 2 : 0;
        const e = new Event("devicemotion") as Event & Record<string, unknown>;
        e.accelerationIncludingGravity = {
          x: 0,
          y: 9.81 * Math.sin((deg * Math.PI) / 180),
          z: 9.81 * Math.cos((deg * Math.PI) / 180),
        };
        e.rotationRate = { alpha: 0, beta: 0, gamma: 0 };
        window.dispatchEvent(e);
      }, 16);
    });
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByLabel("3 reps")).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Saved on this phone.")).toBeVisible();
    await expect(page.getByRole("row", { name: "Reps 3", exact: true })).toBeVisible();
    expect((await said(page)).slice(0, 3)).toEqual(["1.", "2.", "3."]);
  });

  test("with no motion sensors it says so and offers the demo", async ({ page }) => {
    await page.goto(STEADY);
    await acceptDisclaimer(page);
    await page.getByRole("button", { name: "Shoulder raise" }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/no motion sensors|Motion is blocked/, {
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /Try the demo/ })).toBeVisible();
    expect(await problems(page)).toEqual([]);
  });

  test("settings: large text and high contrast change the page and are remembered", async ({ page }) => {
    await page.goto(STEADY);
    await acceptDisclaimer(page);
    await page.getByLabel("Extra large").check();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("24px");
    await page.getByLabel("High contrast").check();
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector(".hk-theme")!).backgroundColor),
    ).toBe("rgb(0, 0, 0)");
    expect(await problems(page)).toEqual([]);
    await page.reload();
    await expect(page.getByLabel("Extra large")).toBeChecked();
    await expect(page.getByLabel("High contrast")).toBeChecked();
    await page.getByLabel("Count reps out loud").uncheck();
    await page.reload();
    await expect(page.getByLabel("Count reps out loud")).not.toBeChecked();
  });

  test("voice-only mode: a minimal screen, with the instructions spoken", async ({ page }) => {
    test.setTimeout(60_000);
    await spy(page);
    await page.goto(`${STEADY}?speed=8`);
    await acceptDisclaimer(page);
    await page.getByLabel("Voice only").check();
    await runDemo(page);
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByLabel("1 reps")).toBeVisible({ timeout: 30_000 });
    expect(await page.getByRole("meter").count()).toBe(0); // no gauge: it's meant to be heard
    const spoken = await said(page);
    expect(spoken[0]).toBe("Hold still at the start position for two seconds.");
    expect(spoken[1]).toBe("Ready. Start your reps.");
    expect(await problems(page)).toEqual([]);
  });

  test("every button is at least 44 × 44 px", async ({ page }) => {
    await page.goto(STEADY);
    await acceptDisclaimer(page);
    for (const where of ["home", "setup"]) {
      if (where === "setup") await page.getByRole("button", { name: "Shoulder raise" }).click();
      const small = await page.$$eval(
        "button",
        (els) =>
          els.map((el) => el.getBoundingClientRect()).filter((r) => r.width < 43.5 || r.height < 43.5).length,
      );
      expect(small, where).toBe(0);
    }
  });

  test("with reduced motion, nothing moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(STEADY);
    await acceptDisclaimer(page);
    expect(
      await page.evaluate(
        () => document.getAnimations().filter((a) => (a as CSSAnimation).animationName).length,
      ),
    ).toBe(0);
  });
});
