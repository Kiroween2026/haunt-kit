// Built by Yadnesh for Anish's gestures package (Anish is out this week). Owner: Anish.
//
// "Gesture from a spec": when Kiro saves packages/gestures/specs/<name>.gesture.md, the hook in
// .kiro/hooks/gesture-from-spec.json runs `tsx packages/gestures/src/hook/cli.ts`. That reads the
// hook event from STDIN, checks the spec, and prints a work order. Kiro adds the output to the
// conversation and follows it.

export const REQUIRED_SECTIONS = [
  "Name",
  "What the player does",
  "Sensors used",
  "Fires when",
  "Must NOT fire when",
  "Config and defaults",
  "Example recordings",
] as const;

/** Every string anywhere in a JSON value. The hook event's exact field names don't matter this way. */
export function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

/** The saved gesture spec in a hook event, or null. Files starting with "_" (the template) don't count. */
export function findSpecPath(stdin: string): string | null {
  let event: unknown;
  try {
    event = JSON.parse(stdin);
  } catch {
    event = stdin.trim(); // a bare path also works
  }
  for (const s of allStrings(event)) {
    const m = s.match(/(?:^|[\\/])([^\\/]+)\.gesture\.md$/);
    if (m && !m[1]!.startsWith("_")) return s;
  }
  return null;
}

export function missingSections(spec: string): string[] {
  const headings = [...spec.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1]!.trim().toLowerCase());
  return REQUIRED_SECTIONS.filter((section) => !headings.some((h) => h.startsWith(section.toLowerCase())));
}

/** "double-shake" → { kebab: "double-shake", camel: "doubleShake", pascal: "DoubleShake", upper: "DOUBLE_SHAKE" } */
export function names(file: string) {
  const kebab = (file.split(/[\\/]/).pop() ?? file).replace(/\.gesture\.md$/, "");
  const parts = kebab.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join("");
  return {
    kebab,
    pascal,
    camel: pascal[0]!.toLowerCase() + pascal.slice(1),
    upper: parts.map((p) => p.toUpperCase()).join("_"),
  };
}

/** The instructions Kiro gets after saving a gesture spec. Null if the saved file isn't a gesture spec. */
export function workOrder(stdin: string, readSpec: (path: string) => string | null): string | null {
  const path = findSpecPath(stdin);
  if (!path) return null;
  const spec = readSpec(path);
  if (spec === null) return `GESTURE SPEC SAVED: ${path}\nThe file could not be read. Check the path.`;
  const missing = missingSections(spec);
  if (missing.length > 0) {
    return [
      `GESTURE SPEC SAVED: ${path}`,
      `The spec is missing these sections: ${missing.join(", ")}.`,
      "Do NOT write a detector yet. Ask the user to complete the spec (see packages/gestures/specs/_template.gesture.md), or fill in the sections yourself and tell the user what you assumed.",
    ].join("\n");
  }
  const n = names(path);
  return [
    `GESTURE SPEC SAVED: ${path}`,
    `Build the "${n.kebab}" gesture now. Do these steps in order, without asking:`,
    "",
    `1. Read the spec, .kiro/steering/gestures.md and packages/gestures/src/detectors/shake.ts (a finished detector to copy the style from).`,
    `2. Create packages/gestures/src/detectors/${n.kebab}.ts. Pure TypeScript, no browser APIs. Export DEFAULT_${n.upper}_CONFIG, create${n.pascal}Detector(config?) and ${n.camel}Detector (satisfies Detector<${n.pascal}Config>). Use the spec's defaults. Keep buffers bounded and make reset() clear all state.`,
    `3. Create packages/gestures/src/detectors/${n.kebab}.test.ts with helpers from src/testing/streams.ts:`,
    `   - one test for each line under "Fires when";`,
    `   - one fast-check property test for EVERY line under "Must NOT fire when" (generate many streams, not one example);`,
    `   - a test that the same gesture is detected at 30 Hz and at 120 Hz.`,
    `4. Export it from src/detectors/index.ts and src/index.ts, and register it in src/catalog.ts.`,
    `5. If the spec says it runs on the phone, add it to PHONE_DETECTORS in packages/controller/src/detectors.ts.`,
    `6. Run: pnpm vitest run packages/gestures. Fix every failure. If a property test fails, show the counterexample before changing anything. Never change a threshold without checking it against the files in recordings/ (src/recordings.test.ts).`,
    `7. Add one line to KIRO_LOG.md (what you built, and any bug a property test caught).`,
    "",
    "Spec:",
    "---",
    spec.trim(),
    "---",
  ].join("\n");
}
