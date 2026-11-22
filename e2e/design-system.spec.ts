import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const UI = "http://localhost:5182/";

for (const theme of ["haunted", "lantern"] as const) {
  test.describe(`design system, ${theme} theme`, () => {
    test("has no accessibility violations (WCAG 2 A and AA, including rendered color contrast)", async ({
      page,
    }) => {
      await page.goto(`${UI}?theme=${theme}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    });

    test("every button and link is at least 44 × 44 px", async ({ page }) => {
      await page.goto(`${UI}?theme=${theme}`);
      const small = await page.$$eval("button, a[href], input, [role=button]", (els) =>
        els
          .map((el) => ({
            name: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30),
            r: el.getBoundingClientRect(),
          }))
          .filter(({ r }) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
          .map(({ name, r }) => `${name}: ${Math.round(r.width)}×${Math.round(r.height)}`),
      );
      expect(small).toEqual([]);
    });

    test("keyboard focus is visible", async ({ page, browserName }) => {
      // Safari doesn't move focus to buttons with Tab unless the user turns that on, so it can't be tested this way.
      test.skip(browserName === "webkit", "Safari only Tabs to buttons when the user enables it");
      await page.goto(`${UI}?theme=${theme}`);
      await page.keyboard.press("Tab");
      const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        return { tag: el.tagName, width: parseFloat(s.outlineWidth), style: s.outlineStyle };
      });
      expect(outline.tag).toBe("BUTTON");
      expect(outline.style).not.toBe("none");
      expect(outline.width).toBeGreaterThanOrEqual(3);
    });

    test("the dialog traps focus, closes on Escape and returns focus", async ({ page, browserName }) => {
      await page.goto(`${UI}?theme=${theme}`);
      const opener = page.getByRole("button", { name: "Open dialog" });
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "Leave the séance?" });
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        // Focus stays in the dialog. It may also leave to the browser's own UI (then the page's activeElement is <body>),
        // but it never lands on the page behind the dialog.
        expect(
          await page.evaluate(
            () => document.activeElement === document.body || !!document.activeElement?.closest("dialog"),
          ),
        ).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      // Safari doesn't focus a button when it is clicked, so there is nothing to return focus to there.
      if (browserName !== "webkit") await expect(opener).toBeFocused();
    });

    test("toasts are announced and can be dismissed", async ({ page }) => {
      await page.goto(`${UI}?theme=${theme}`);
      await page.getByRole("button", { name: "Show toast" }).click();
      await expect(page.getByRole("status")).toContainText("Casper joined the séance");
      await page.getByRole("button", { name: /Dismiss: Casper joined/ }).click();
      await expect(page.getByRole("status")).not.toContainText("Casper joined");
    });

    test("with reduced motion, nothing moves", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${UI}?theme=${theme}`);
      const animations = await page.evaluate(
        () => document.getAnimations().filter((a) => (a as CSSAnimation).animationName).length,
      );
      expect(animations).toBe(0);
    });

    test("without reduced motion, the ghosts float", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(`${UI}?theme=${theme}`);
      const names = await page.evaluate(() =>
        document.getAnimations().map((a) => (a as CSSAnimation).animationName),
      );
      expect(names).toContain("hk-float");
    });
  });
}

test("the two themes really look different", async ({ page }) => {
  await page.goto(`${UI}?theme=haunted`);
  const dark = await page.evaluate(
    () => getComputedStyle(document.querySelector(".hk-theme")!).backgroundColor,
  );
  await page.goto(`${UI}?theme=lantern`);
  const light = await page.evaluate(
    () => getComputedStyle(document.querySelector(".hk-theme")!).backgroundColor,
  );
  expect(dark).toBe("rgb(13, 10, 20)");
  expect(light).toBe("rgb(255, 248, 236)");
});
