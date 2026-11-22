import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import {
  BORDER_PAIRS,
  COLOR_TOKENS,
  TEXT_PAIRS,
  THEME_NAMES,
  colors,
  contrast,
  fonts,
  themeCss,
} from "./tokens";

const css = (file: string) => readFileSync(new URL(`./styles/${file}`, import.meta.url), "utf8");

describe("tokens.css is generated from tokens.ts", () => {
  it("is up to date (run `pnpm --filter @haunt-kit/ui gen:tokens` if this fails)", () => {
    expect(css("tokens.css")).toBe(themeCss());
  });
});

describe("contrast", () => {
  it("matches known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
  });

  it("is symmetric and between 1 and 21, for any two colors", () => {
    const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, "0")}`);
    fc.assert(
      fc.property(hex, hex, (a, b) => {
        const c = contrast(a, b);
        expect(c).toBeCloseTo(contrast(b, a), 10);
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(21.0000001);
      }),
    );
  });
});

describe("WCAG AA: every pair of colors we use", () => {
  const theme = fc.constantFrom(...THEME_NAMES);

  it("text pairs have at least 4.5:1, in every theme", () => {
    fc.assert(
      fc.property(theme, fc.constantFrom(...TEXT_PAIRS), (t, [fg, bg]) => {
        expect(contrast(colors[t][fg], colors[t][bg]), `${t}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }),
      { numRuns: 200 },
    );
  });

  it("borders and focus rings have at least 3:1 against their background", () => {
    fc.assert(
      fc.property(theme, fc.constantFrom(...BORDER_PAIRS), (t, [fg, bg]) => {
        expect(contrast(colors[t][fg], colors[t][bg]), `${t}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 200 },
    );
  });

  it("both themes define every token, as valid #rrggbb colors", () => {
    for (const t of THEME_NAMES) {
      for (const token of COLOR_TOKENS) expect(colors[t][token]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("theme switching", () => {
  it("each theme sets every color variable, and the generated CSS contains both", () => {
    const out = themeCss();
    for (const t of THEME_NAMES) {
      expect(out).toContain(`[data-theme="${t}"]`);
      for (const token of COLOR_TOKENS) expect(out).toContain(`--hk-color-${token}: ${colors[t][token]};`);
    }
  });

  it("the contrast theme reaches AAA (7:1) for all text", () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      if (["warning", "danger", "success"].includes(fg) && bg !== "bg" && bg !== "surface") continue;
      expect(
        contrast(colors.contrast[fg], colors.contrast[bg]),
        `contrast: ${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(7);
    }
  });

  it("the themes are different", () => {
    expect(colors.haunted.bg).not.toBe(colors.lantern.bg);
    expect(fonts.haunted.heading).not.toBe(fonts.lantern.heading);
  });
});

describe("fonts", () => {
  it("only use families that are self-hosted under the SIL Open Font License", () => {
    const imported = css("fonts.css");
    for (const t of THEME_NAMES) {
      for (const stack of Object.values(fonts[t])) {
        const first = stack.split(",")[0]!.replace(/"/g, "").trim();
        expect(imported.toLowerCase()).toContain(first.toLowerCase().replace(/ /g, "-"));
      }
    }
  });
});

describe("components.css rules", () => {
  const styles = css("components.css").replace(/\/\*[\s\S]*?\*\//g, "");

  /** Splits CSS into top-level rules and at-rule blocks, counting braces. */
  function blocks(source: string): { head: string; body: string }[] {
    const out: { head: string; body: string }[] = [];
    let i = 0;
    while (i < source.length) {
      const open = source.indexOf("{", i);
      if (open === -1) break;
      let depth = 1;
      let j = open + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === "{") depth++;
        else if (source[j] === "}") depth--;
        j++;
      }
      out.push({ head: source.slice(i, open).trim(), body: source.slice(open + 1, j - 1) });
      i = j;
    }
    return out;
  }
  const top = blocks(styles);
  /** Plain rules, outside any @media. */
  const rules = top.filter((b) => !b.head.startsWith("@"));
  const reducedMotion = top.find((b) => b.head === "@media (prefers-reduced-motion: reduce)")!;
  const reducedRules = blocks(reducedMotion.body);

  it("the tap target is 44 px", () => {
    expect(css("tokens.css")).toContain("--hk-target: 2.75rem;"); // 2.75 × 16 = 44
  });

  it("buttons are at least the tap target tall and wide", () => {
    const rule = rules.find((r) => r.head === ".hk-button");
    expect(rule?.body).toContain("min-height: var(--hk-target)");
    expect(rule?.body).toContain("min-width: var(--hk-target)");
  });

  it("focus is visible in every theme", () => {
    const rule = rules.find((r) => r.head.includes(":focus-visible"));
    expect(rule?.body).toMatch(/outline: var\(--hk-focus-width\) solid/);
    expect(styles).not.toMatch(/outline:\s*none/);
  });

  it("every animated class is switched off for prefers-reduced-motion", () => {
    const animated = rules
      .filter((r) => {
        const m = r.body.match(/animation:\s*([^;\s]+)/);
        return m !== null && m[1] !== "none";
      })
      .flatMap((r) => r.head.split(",").map((s) => s.trim()));
    expect(animated).toEqual([".hk-ghost__body", ".hk-countdown--urgent", ".hk-toast"]);
    const off = reducedRules
      .filter((r) => /animation:\s*none/.test(r.body))
      .flatMap((r) => r.head.split(",").map((s) => s.trim()));
    for (const sel of animated) expect(off, `${sel} is animated but not switched off`).toContain(sel);
  });

  it("transitions and hover movement are switched off too", () => {
    expect(reducedRules.some((r) => r.head === ".hk-button" && /transition:\s*none/.test(r.body))).toBe(true);
    expect(
      reducedRules.some((r) => r.head.startsWith(".hk-button:hover") && /transform:\s*none/.test(r.body)),
    ).toBe(true);
  });

  it("text is never smaller than 16 px", () => {
    const tokens = css("tokens.css");
    const sizes = [...tokens.matchAll(/--hk-text-\w+:\s*([\d.]+)rem/g)];
    expect(sizes.length).toBe(5);
    for (const m of sizes) expect(Number(m[1])).toBeGreaterThanOrEqual(1);
  });

  it("uses colors only through theme variables (except the white QR background)", () => {
    const hardcoded = [...styles.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hardcoded).toEqual(["#fff"]);
  });
});
