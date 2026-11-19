import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MAX_MESSAGE_BYTES,
  MAX_SAMPLES_PER_BATCH,
  PROTOCOL_VERSION,
  ProtocolError,
  hostToRelay,
  phoneToRelay,
  relayToHost,
  relayToPhone,
  type Channel,
} from "./index";
import {
  gestureEventArb,
  hostToRelayArbs,
  phoneToRelayArbs,
  relayToHostArbs,
  relayToPhoneArbs,
  sampleArb,
} from "./testing/arbitraries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChannel = Channel<any>;

const channels: [string, AnyChannel, Record<string, fc.Arbitrary<unknown>>][] = [
  ["phoneToRelay", phoneToRelay, phoneToRelayArbs],
  ["relayToPhone", relayToPhone, relayToPhoneArbs],
  ["hostToRelay", hostToRelay, hostToRelayArbs],
  ["relayToHost", relayToHost, relayToHostArbs],
];

describe("protocol version", () => {
  it("is 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe.each(channels)("%s channel", (_name, channel, arbs) => {
  it("has a generator for every message type", () => {
    expect(Object.keys(arbs).sort()).toEqual([...channel.types].sort());
  });

  it.each(Object.keys(arbs))("round-trips every %s message: decode(encode(m)) equals m", (type) => {
    fc.assert(
      fc.property(arbs[type]!, (m) => {
        const result = channel.decode(channel.encode(m));
        expect(result).toEqual({ ok: true, message: m });
      }),
    );
  });

  it("ignores unknown fields", () => {
    const anyMessage = fc.oneof(...Object.values(arbs));
    fc.assert(
      fc.property(anyMessage, fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue(), (m, key, extra) => {
        const known = m as Record<string, unknown>;
        fc.pre(!(key in known));
        const withExtra = JSON.stringify({ ...known, [key]: extra });
        fc.pre(withExtra.length <= MAX_MESSAGE_BYTES);
        expect(channel.decode(withExtra)).toEqual({ ok: true, message: m });
      }),
    );
  });

  it("rejects every message over 16 KB with too_large", () => {
    const anyMessage = fc.oneof(...Object.values(arbs));
    fc.assert(
      fc.property(anyMessage, fc.integer({ min: 1, max: 4096 }), (m, over) => {
        const base = JSON.stringify({ ...(m as object), pad: "" });
        const padded = JSON.stringify({
          ...(m as object),
          pad: "x".repeat(MAX_MESSAGE_BYTES - base.length + over),
        });
        const result = channel.decode(padded);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("too_large");
      }),
    );
  });

  it("never throws, whatever the input", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.jsonValue().map((j) => JSON.stringify(j)),
        ),
        (raw) => {
          const result = channel.decode(raw);
          expect(typeof result.ok).toBe("boolean");
        },
      ),
    );
  });

  it("rejects unknown types", () => {
    fc.assert(
      fc.property(fc.string(), (type) => {
        fc.pre(!channel.types.includes(type));
        expect(channel.decode(JSON.stringify({ v: 1, type }))).toMatchObject({
          ok: false,
          error: { code: "unknown_type" },
        });
      }),
    );
  });

  it("rejects other protocol versions", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (version) => {
        fc.pre(version !== 1);
        expect(channel.decode(JSON.stringify({ v: version, type: "ping", t: 0 }))).toMatchObject({
          ok: false,
          error: { code: "unsupported_version" },
        });
      }),
    );
  });
});

describe("bad input", () => {
  it.each([
    ["not JSON", "{nope"],
    ["an array", "[1,2]"],
    ["null", "null"],
    ["a number", "42"],
  ])("rejects %s as bad_message", (_label, raw) => {
    expect(phoneToRelay.decode(raw)).toMatchObject({ ok: false, error: { code: "bad_message" } });
  });

  it("rejects a known type with a wrong field as bad_message and says which field", () => {
    const result = phoneToRelay.decode(JSON.stringify({ v: 1, type: "join", roomCode: "abcd", name: "A" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad_message");
      expect(result.error.message).toContain("roomCode");
    }
  });

  it("rejects a room code containing O, I or L", () => {
    for (const roomCode of ["OBCD", "AICD", "ABLD"]) {
      const raw = JSON.stringify({
        v: 1,
        type: "join",
        roomCode,
        name: "Ana",
        device: { os: "ios", browser: "Safari" },
      });
      expect(phoneToRelay.decode(raw).ok).toBe(false);
    }
  });

  it("rejects a sensor batch that is empty", () => {
    expect(phoneToRelay.decode(JSON.stringify({ v: 1, type: "sensor_frames", samples: [] })).ok).toBe(false);
  });
});

describe("gesture data keys", () => {
  // Found by the round-trip property in CI: data {"__proto__": 0} decoded as {}, because zod
  // drops that key. Such keys are now rejected instead of silently changed.
  it.each(["__proto__", "_x", "1st", "", "a-b", "x".repeat(41)])("rejects the key %j", (key) => {
    const raw = `{"v":1,"type":"gesture","event":{"name":"shake","t":0,"data":{${JSON.stringify(key)}:1}}}`;
    expect(phoneToRelay.decode(raw)).toMatchObject({ ok: false, error: { code: "bad_message" } });
  });

  it("accepts normal keys", () => {
    const m = {
      v: 1,
      type: "gesture",
      event: { name: "flick", t: 0, data: { dx: 1, strength_2: 0.5 } },
    } as const;
    expect(phoneToRelay.decode(JSON.stringify(m))).toEqual({ ok: true, message: m });
  });
});

describe("no player spoofing", () => {
  it("drops any playerId a phone puts on its frames or gestures", () => {
    const phoneInput = fc.oneof(
      fc
        .array(sampleArb, { minLength: 1, maxLength: 8 })
        .map((samples) => ({ v: 1, type: "sensor_frames", samples })),
      gestureEventArb.map((event) => ({ v: 1, type: "gesture", event })),
    );
    fc.assert(
      fc.property(phoneInput, fc.string(), (m, fakeId) => {
        const result = phoneToRelay.decode(JSON.stringify({ ...m, playerId: fakeId }));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.message).not.toHaveProperty("playerId");
      }),
    );
  });
});

describe("batch size limit", () => {
  // Numbers with the longest JSON form, e.g. -2.2250738585072014e-308 (24 chars).
  const longest = fc.constantFrom(-2.2250738585072014e-308, -1.7976931348623157e308, -Math.PI * 1e-300);
  const worstSample = fc.record({
    t: longest,
    ax: longest,
    ay: longest,
    az: longest,
    gx: longest,
    gy: longest,
    gz: longest,
    alpha: longest,
    beta: longest,
    gamma: longest,
    rms: fc.constant(0.12345678901234568),
  });

  it("a full batch of worst-case samples always fits in 16 KB", () => {
    fc.assert(
      fc.property(
        fc.array(worstSample, { minLength: MAX_SAMPLES_PER_BATCH, maxLength: MAX_SAMPLES_PER_BATCH }),
        (samples) => {
          const text = relayToHost.encode({ v: 1, type: "sensor_frames", playerId: "x".repeat(64), samples });
          expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
        },
      ),
    );
  });

  it("rejects batches over the limit", () => {
    const samples = Array.from({ length: MAX_SAMPLES_PER_BATCH + 1 }, (_, t) => ({
      t,
      ax: 0,
      ay: 0,
      az: 9.81,
      gx: 0,
      gy: 0,
      gz: 0,
      alpha: 0,
      beta: 0,
      gamma: 0,
    }));
    expect(phoneToRelay.decode(JSON.stringify({ v: 1, type: "sensor_frames", samples })).ok).toBe(false);
  });
});

describe("encode", () => {
  it("throws ProtocolError on an invalid message", () => {
    // @ts-expect-error: deliberately invalid
    expect(() => phoneToRelay.encode({ v: 1, type: "ping" })).toThrow(ProtocolError);
  });

  it("throws ProtocolError on an unknown type", () => {
    // @ts-expect-error: deliberately invalid
    expect(() => phoneToRelay.encode({ v: 1, type: "room_ready" })).toThrow(ProtocolError);
  });
});
