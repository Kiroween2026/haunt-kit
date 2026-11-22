import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { REQUIRED_SECTIONS, findSpecPath, missingSections, names, workOrder } from "./work-order";

const template = readFileSync(new URL("../../specs/_template.gesture.md", import.meta.url), "utf8");
const good = REQUIRED_SECTIONS.map((s) => `## ${s}\n\ntext`).join("\n\n");

describe("findSpecPath", () => {
  it("finds the path wherever the hook event puts it", () => {
    const path = "packages/gestures/specs/double-shake.gesture.md";
    expect(findSpecPath(JSON.stringify({ hook_event_name: "PostFileSave", tool_input: { path } }))).toBe(
      path,
    );
    expect(findSpecPath(JSON.stringify({ file: { path } }))).toBe(path);
    expect(findSpecPath(JSON.stringify([{ a: [path] }]))).toBe(path);
    expect(findSpecPath(path)).toBe(path); // a bare path
  });

  it("ignores the template, other files and junk", () => {
    expect(findSpecPath(JSON.stringify({ path: "packages/gestures/specs/_template.gesture.md" }))).toBeNull();
    expect(findSpecPath(JSON.stringify({ path: "packages/gestures/src/index.ts" }))).toBeNull();
    expect(findSpecPath("")).toBeNull();
    expect(findSpecPath("{not json")).toBeNull();
    expect(findSpecPath("null")).toBeNull();
  });

  it("works with absolute and Windows paths", () => {
    expect(
      findSpecPath(JSON.stringify({ p: "/Users/a/haunt-kit/packages/gestures/specs/spin2.gesture.md" })),
    ).toMatch(/spin2/);
    expect(
      findSpecPath(JSON.stringify({ p: "C:\\work\\haunt-kit\\packages\\gestures\\specs\\spin2.gesture.md" })),
    ).toMatch(/spin2/);
  });

  it("never throws for any input", () => {
    fc.assert(fc.property(fc.string(), (s) => void findSpecPath(s)));
    fc.assert(fc.property(fc.jsonValue(), (v) => void findSpecPath(JSON.stringify(v))));
  });
});

describe("missingSections", () => {
  it("the template has every section, so a copy of it is accepted", () => {
    expect(missingSections(template)).toEqual([]);
  });
  it("reports what's missing, case-insensitively", () => {
    expect(missingSections("## name\n## Fires WHEN")).toEqual(
      REQUIRED_SECTIONS.filter((s) => s !== "Name" && s !== "Fires when"),
    );
    expect(missingSections("")).toEqual([...REQUIRED_SECTIONS]);
  });
});

describe("names", () => {
  it("makes identifiers from the file name", () => {
    expect(names("packages/gestures/specs/double-shake.gesture.md")).toEqual({
      kebab: "double-shake",
      pascal: "DoubleShake",
      camel: "doubleShake",
      upper: "DOUBLE_SHAKE",
    });
    expect(names("x.gesture.md").camel).toBe("x");
  });
});

describe("workOrder", () => {
  const event = (path: string) => JSON.stringify({ path });

  it("returns nothing when the saved file isn't a gesture spec", () => {
    expect(workOrder(event("README.md"), () => good)).toBeNull();
    expect(workOrder(event("specs/_template.gesture.md"), () => good)).toBeNull();
  });

  it("gives a full work order for a complete spec", () => {
    const order = workOrder(event("packages/gestures/specs/double-shake.gesture.md"), () => good)!;
    for (const part of [
      "createDoubleShakeDetector",
      "doubleShakeDetector",
      "DEFAULT_DOUBLE_SHAKE_CONFIG",
      "detectors/double-shake.ts",
      "double-shake.test.ts",
      'EVERY line under "Must NOT fire when"',
      "30 Hz and at 120 Hz",
      "src/catalog.ts",
      "pnpm vitest run packages/gestures",
      "KIRO_LOG.md",
    ]) {
      expect(order).toContain(part);
    }
    expect(order).toContain(good.trim()); // the spec itself is included
  });

  it("refuses to build from an incomplete spec", () => {
    const order = workOrder(event("a/b.gesture.md"), () => "## Name\nx")!;
    expect(order).toContain("missing these sections");
    expect(order).toContain("Do NOT write a detector yet");
    expect(order).not.toContain("createBDetector");
  });

  it("says so when the file can't be read", () => {
    expect(workOrder(event("a/b.gesture.md"), () => null)).toContain("could not be read");
  });
});

describe("the CLI the hook runs", () => {
  const cli = new URL("./cli.ts", import.meta.url).pathname;
  const root = new URL("../../../../", import.meta.url).pathname;
  const run = (input: string) =>
    execFileSync("pnpm", ["exec", "tsx", cli], { input, cwd: root, encoding: "utf8" });

  it("prints a work order for a saved spec and nothing for other files", () => {
    const spec = readdirSync(new URL("../../specs/", import.meta.url)).find(
      (f) => f.endsWith(".gesture.md") && !f.startsWith("_"),
    );
    if (spec) {
      expect(run(JSON.stringify({ path: `packages/gestures/specs/${spec}` }))).toContain(
        "GESTURE SPEC SAVED",
      );
    }
    expect(run(JSON.stringify({ path: "packages/gestures/src/index.ts" }))).toBe("");
  });
});
