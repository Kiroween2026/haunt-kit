// Task 4.4: every detector against the real phone recordings in recordings/.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { catalog } from "./catalog";
import { recordingSchema } from "./recording/schema";
import { run } from "./testing/streams";

const dir = new URL("../../../recordings/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (f: string) => recordingSchema.parse(JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const eventNames = (f: string, detector: string) => [
  ...new Set(run(catalog.create(detector), load(f).samples).map((e) => e.name)),
];

describe("recordings/", () => {
  it("has real recordings", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  describe.each(files)("%s", (file) => {
    it("passes the recording schema", () => {
      expect(() => load(file)).not.toThrow();
    });

    // None of these recordings contains a shake, flick, spin, flip or scream, so none may fire.
    it.each(["shake", "flick", "spin", "flip", "scream"])("%s does not fire", (name) => {
      expect(eventNames(file, name)).toEqual([]);
    });

    it("rep never counts a rep", () => {
      expect(eventNames(file, "rep")).not.toContain("rep");
    });
  });

  it("hold-still fires on a phone lying flat, and never breaks", () => {
    for (const f of files.filter(
      (x) => x.includes("table-flat") && (x.includes("17-28-41") || x.includes("17-44-05")),
    )) {
      expect(eventNames(f, "hold-still")).toEqual(["hold-still"]);
    }
  });

  it("hold-still breaks where the phone really moved", () => {
    for (const f of files.filter((x) => x.includes("left-right") || x.includes("17-31-09"))) {
      expect(eventNames(f, "hold-still")).toContain("hold-still-broken");
    }
  });

  it("rep calibrates on a phone that was held still at the start", () => {
    const f = files.find((x) => x.includes("17-28-41"))!;
    expect(eventNames(f, "rep")).toEqual(["rep-calibrated"]);
  });
});
