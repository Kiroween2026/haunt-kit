// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// Finds design-rule problems in app and UI files, with exact file and line, from
// .kiro/steering/design.md. Run by the "Design check on save" hook and by `pnpm design-check`.
//
//   pnpm design-check                 checks every file in apps/*/src and packages/ui/src
//   echo '{"path":"apps/x/src/A.tsx"}' | pnpm design-check   checks the file named in a hook event

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type Finding = { file: string; line: number; rule: string; message: string };

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** Files that define the design tokens may contain colors. */
const COLOR_DEFINITIONS = /packages\/ui\/src\/(tokens\.(ts|test\.ts)|styles\/.*|.*\.test\.tsx?)$/;

export function checkFile(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const add = (line: number, rule: string, message: string) => findings.push({ file, line, rule, message });
  const lines = text.split("\n");
  const isCss = file.endsWith(".css");
  const isTsx = file.endsWith(".tsx");
  const inUi = file.includes("packages/ui/");
  const isTest = /\.test\.tsx?$/.test(file);
  if (isTest) return findings;

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/, (m) => (raw.includes("://") ? m : ""));

    if (!COLOR_DEFINITIONS.test(file) && !(inUi && file.includes("/demo/"))) {
      for (const m of line.matchAll(HEX)) {
        if (m[0].toLowerCase() === "#fff" && inUi && file.endsWith("components.css")) continue; // the QR background
        add(n, "colors", `Hard-coded color ${m[0]}. Use a theme variable, e.g. var(--hk-color-text).`);
      }
    }
    // `:focus:not(:focus-visible) { outline: none }` is fine: it only hides the ring for mouse clicks.
    const nearby = lines.slice(Math.max(0, i - 3), i + 1).join(" ");
    if (/outline\s*:\s*(none|0)\b/.test(line) && !/:not\(:focus-visible\)/.test(nearby)) {
      add(n, "focus", "Removes the focus outline. Keyboard users need a visible focus ring.");
    }
    const size = line.match(/font-size\s*:\s*([\d.]+)(px|rem|em)\b/);
    if (size) {
      const px = size[2] === "px" ? Number(size[1]) : Number(size[1]) * 16;
      if (px < 16) add(n, "text-size", `Text smaller than 16 px (${size[1]}${size[2]}).`);
    }
    const height = line.match(/(?<![-\w])(height|min-height)\s*:\s*([\d.]+)px\b/);
    if (
      height &&
      Number(height[2]) < 44 &&
      /button|btn|tap|target/i.test(lines.slice(Math.max(0, i - 6), i + 1).join(" "))
    ) {
      add(n, "tap-target", `Tap target ${height[2]} px tall. Use at least 44 px (var(--hk-target)).`);
    }
    if (isTsx) {
      if (/<img\b(?![^>]*\balt=)/.test(line))
        add(n, "alt-text", 'Image without alt text. Use alt="" if it is only decoration.');
      if (/<(div|span)\b[^>]*\bonClick=/.test(line) && !/role=|tabIndex=/.test(line)) {
        add(
          n,
          "keyboard",
          "A clickable <div>/<span> can't be reached by keyboard. Use <Button> from @haunt-kit/ui.",
        );
      }
      if (/<button\b/.test(line) && !inUi)
        add(n, "components", "Use <Button> from @haunt-kit/ui instead of a raw <button>.");
      if (/style=\{\{[^}]*(color|background)\s*:\s*["'`]#/.test(line) && !COLOR_DEFINITIONS.test(file)) {
        add(n, "colors", "Inline color. Use a theme variable.");
      }
      if (/\b(alert|confirm|prompt)\(/.test(line))
        add(n, "dialogs", "Use <Modal> or a toast instead of the browser's alert, confirm or prompt.");
    }
  });

  // Motion: any animation or transition needs a prefers-reduced-motion fallback in the same file.
  if (isCss || isTsx) {
    const animatedAt = lines.findIndex(
      (l) => /(^|[\s;{])(animation|transition)\s*:\s*(?!none)\S/.test(l) || /@keyframes/.test(l),
    );
    if (animatedAt !== -1 && !/prefers-reduced-motion/.test(text) && !inUi) {
      add(
        animatedAt + 1,
        "reduced-motion",
        "Animation or transition without a prefers-reduced-motion fallback in this file.",
      );
    }
  }

  // Tone: UI text should be short, plain and friendly.
  if (isTsx && !inUi) {
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/>\s*([^<>{}]{80,})\s*</g)) {
        add(
          i + 1,
          "tone",
          `A text of ${m[1]!.trim().length} characters. Keep UI text to short, plain sentences.`,
        );
      }
      if (
        /!!+|\b(ERROR|FAILED|FATAL)\b/.test(l.replace(/\{.*?\}/g, "")) &&
        />[^<]*(!!|ERROR|FAILED|FATAL)/.test(l)
      ) {
        add(i + 1, "tone", 'Shouty or scary wording. The tone is "spooky but friendly".');
      }
    });
  }
  return findings;
}

export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "node_modules" && name !== "dist") walk(p);
      } else if (/\.(tsx|css)$/.test(name)) out.push(p);
    }
  };
  for (const dir of readdirSync(join(root, "apps"))) walk(join(root, "apps", dir, "src"));
  walk(join(root, "packages/ui/src"));
  return out;
}

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "";
  return [
    `DESIGN CHECK: ${findings.length} problem${findings.length === 1 ? "" : "s"} against .kiro/steering/design.md`,
    ...findings.map((f) => `${f.file}:${f.line}  [${f.rule}]  ${f.message}`),
    "Fix these now. If one is a deliberate exception, say why in a code comment.",
  ].join("\n");
}

/** The path named anywhere in a hook event's JSON, if it is a file this checker cares about. */
export function pathFromEvent(stdin: string): string | null {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  try {
    walk(JSON.parse(stdin));
  } catch {
    strings.push(stdin.trim());
  }
  return strings.find((s) => /(apps\/[^/]+\/src|packages\/ui\/src)\/.*\.(tsx|css)$/.test(s)) ?? null;
}

if (process.argv[1]?.endsWith("design-check.ts")) {
  const stdin = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
  const one = stdin ? pathFromEvent(stdin) : null;
  const files = one ? [one] : stdin.trim() ? [] : listFiles(process.cwd());
  const findings = files
    .filter(existsSync)
    .flatMap((f) => checkFile(f.replace(`${process.cwd()}/`, ""), readFileSync(f, "utf8")));
  const out = formatFindings(findings);
  if (out) console.log(out);
  process.exit(!one && findings.length > 0 ? 1 : 0);
}
