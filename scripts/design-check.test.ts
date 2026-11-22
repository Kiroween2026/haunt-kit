import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checkFile, formatFindings, pathFromEvent } from "./design-check";

const rules = (file: string, text: string) => checkFile(file, text).map((f) => `${f.line}:${f.rule}`);

describe("design-check finds problems with exact lines", () => {
  const app = "apps/seance-party/src/Lobby.tsx";

  it("hard-coded colors, in CSS and inline", () => {
    expect(rules("apps/x/src/a.css", ".a {\n  color: #ff0000;\n}")).toEqual(["2:colors"]);
    expect(rules(app, `export const A = () => <p style={{ color: "#123456" }}>hi</p>;`)).toContain(
      "1:colors",
    );
  });

  it("a removed focus outline", () => {
    expect(rules("apps/x/src/a.css", "a {\n  outline: none;\n}")).toEqual(["2:focus"]);
    expect(rules("apps/x/src/a.css", "a:focus-visible {\n  outline: none;\n}")).toEqual(["2:focus"]);
    expect(rules("apps/x/src/a.css", "a:focus:not(:focus-visible) {\n  outline: none;\n}")).toEqual([]);
  });

  it("small text", () => {
    expect(rules("apps/x/src/a.css", "p {\n  font-size: 12px;\n}")).toEqual(["2:text-size"]);
    expect(rules("apps/x/src/a.css", "p {\n  font-size: 0.75rem;\n}")).toEqual(["2:text-size"]);
    expect(rules("apps/x/src/a.css", "p {\n  font-size: 1rem;\n}")).toEqual([]);
  });

  it("small tap targets on buttons", () => {
    expect(rules("apps/x/src/a.css", ".btn {\n  height: 32px;\n}")).toEqual(["2:tap-target"]);
    expect(rules("apps/x/src/a.css", ".btn {\n  min-height: 44px;\n}")).toEqual([]);
    expect(rules("apps/x/src/a.css", ".logo {\n  height: 32px;\n}")).toEqual([]);
  });

  it("motion without a reduced-motion fallback", () => {
    expect(rules("apps/x/src/a.css", ".a {\n  animation: spin 1s;\n}")).toEqual(["2:reduced-motion"]);
    expect(
      rules(
        "apps/x/src/a.css",
        ".a {\n  animation: spin 1s;\n}\n@media (prefers-reduced-motion: reduce) {\n  .a { animation: none; }\n}",
      ),
    ).toEqual([]);
  });

  it("images without alt, clickable divs, raw buttons, browser dialogs", () => {
    expect(rules(app, `const a = <img src="x.png" />;`)).toEqual(["1:alt-text"]);
    expect(rules(app, `const a = <img src="x.png" alt="" />;`)).toEqual([]);
    expect(rules(app, `const a = <div onClick={go}>x</div>;`)).toEqual(["1:keyboard"]);
    expect(rules(app, `const a = <div role="button" tabIndex={0} onClick={go}>x</div>;`)).toEqual([]);
    expect(rules(app, `const a = <button>Go</button>;`)).toEqual(["1:components"]);
    expect(rules(app, `alert("hi");`)).toEqual(["1:dialogs"]);
  });

  it("long or shouty text", () => {
    expect(rules(app, `const a = <p>${"word ".repeat(20)}</p>;`)).toEqual(["1:tone"]);
    expect(rules(app, `const a = <p>ERROR!! Something FAILED</p>;`)).toEqual(["1:tone"]);
    expect(rules(app, `const a = <p>Pick a ghost name.</p>;`)).toEqual([]);
  });

  it("the design system's own files may define colors and use <button>", () => {
    expect(rules("packages/ui/src/tokens.ts", `export const c = "#0d0a14";`)).toEqual([]);
    expect(rules("packages/ui/src/components/Button.tsx", `<button type="button" />`)).toEqual([]);
  });

  it("test files are not checked", () => {
    expect(checkFile("apps/x/src/a.test.tsx", `<img src="x" />`)).toEqual([]);
  });
});

describe("design-check is quiet about good code", () => {
  const good = `import { Button, Card } from "@haunt-kit/ui";
export function Lobby() {
  return (
    <Card title="Lobby">
      <p>Waiting for ghosts.</p>
      <Button onClick={() => {}}>Start</Button>
    </Card>
  );
}`;
  it("finds nothing", () => {
    expect(checkFile("apps/seance-party/src/Lobby.tsx", good)).toEqual([]);
    expect(formatFindings([])).toBe("");
  });

  it("never throws, whatever the text", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom("a.tsx", "a.css", "packages/ui/src/a.tsx"),
        (text, f) => void checkFile(f, text),
      ),
    );
  });

  it("every finding has a line inside the file", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom("color: #abc;", "outline: none;", "<img src='x'/>", "font-size: 10px;", "ok"),
          { maxLength: 20 },
        ),
        (lines) => {
          const text = lines.join("\n");
          for (const f of checkFile("apps/x/src/a.tsx", text)) {
            expect(f.line).toBeGreaterThanOrEqual(1);
            expect(f.line).toBeLessThanOrEqual(lines.length);
          }
        },
      ),
    );
  });
});

describe("pathFromEvent", () => {
  it("finds an app or ui file anywhere in the event", () => {
    expect(pathFromEvent(JSON.stringify({ tool_input: { path: "apps/steady/src/App.tsx" } }))).toBe(
      "apps/steady/src/App.tsx",
    );
    expect(
      pathFromEvent(JSON.stringify({ file: "/Users/a/haunt-kit/packages/ui/src/styles/components.css" })),
    ).toMatch(/components\.css$/);
  });
  it("ignores other files", () => {
    expect(pathFromEvent(JSON.stringify({ path: "packages/relay/src/index.ts" }))).toBeNull();
    expect(pathFromEvent("")).toBeNull();
  });
});

describe("format", () => {
  it("lists file:line, the rule and what to do", () => {
    const out = formatFindings([
      { file: "apps/a/src/A.tsx", line: 7, rule: "colors", message: "Hard-coded color." },
    ]);
    expect(out).toContain("1 problem against .kiro/steering/design.md");
    expect(out).toContain("apps/a/src/A.tsx:7  [colors]  Hard-coded color.");
  });
});
