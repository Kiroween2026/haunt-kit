import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  isRoomCode,
  normalizeRoomCode,
  type RandomBytes,
} from "./index";

/** A fake random source that plays back the given bytes in a loop. */
function fakeRandom(bytes: number[]): RandomBytes {
  let i = 0;
  return (buffer) => {
    for (let j = 0; j < buffer.length; j++) buffer[j] = bytes[i++ % bytes.length]!;
  };
}

describe("room codes", () => {
  it("alphabet has 23 letters and no O, I or L", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(23);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[OIL]/);
  });

  it("generated codes are always valid (real crypto)", () => {
    for (let i = 0; i < 2000; i++) expect(isRoomCode(generateRoomCode())).toBe(true);
  });

  it("generated codes are always valid for any random source with some usable bytes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 64 }),
        fc.integer({ min: 0, max: 252 }),
        (bytes, usable) => {
          expect(isRoomCode(generateRoomCode(fakeRandom([...bytes, usable])))).toBe(true);
        },
      ),
    );
  });

  it("skips bytes 253-255 so no letter is favored", () => {
    // 253 % 23 === 0 would map to "A" if it weren't rejected.
    expect(generateRoomCode(fakeRandom([253, 254, 255, 1]))).toBe("BBBB");
  });

  it("every byte below 253 maps to each letter exactly 11 times", () => {
    const counts = new Map<string, number>();
    for (let b = 0; b < 253; b++) {
      const letter = generateRoomCode(fakeRandom([b]))[0]!;
      counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
    expect(counts.size).toBe(23);
    expect([...counts.values()].every((n) => n === 11)).toBe(true);
  });

  it("throws instead of looping forever on a broken random source", () => {
    expect(() => generateRoomCode(fakeRandom([255]))).toThrow();
  });

  it("normalizes typed input", () => {
    expect(normalizeRoomCode(" abcd ")).toBe("ABCD");
    expect(normalizeRoomCode("ab cd")).toBe("ABCD");
    expect(normalizeRoomCode("abco")).toBeNull();
    expect(normalizeRoomCode("abc")).toBeNull();
  });

  it("normalizing any valid code in any case gives the code back", () => {
    const code = fc
      .array(fc.constantFrom(...ROOM_CODE_ALPHABET), { minLength: 4, maxLength: 4 })
      .map((l) => l.join(""));
    fc.assert(
      fc.property(code, fc.boolean(), (c, lower) => {
        expect(normalizeRoomCode(lower ? c.toLowerCase() : c)).toBe(c);
      }),
    );
  });
});
