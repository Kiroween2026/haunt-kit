// Owner: Yadnesh. Encode and decode messages for one direction (a "channel").

import { z } from "zod";
import { PROTOCOL_VERSION } from "./types";
import type { ERROR_CODES } from "./schemas";
import { hostToRelaySchemas, phoneToRelaySchemas, relayToHostSchemas, relayToPhoneSchemas } from "./schemas";

/** 16 KB of UTF-8. Checked before JSON.parse when decoding, and after JSON.stringify when encoding. */
export const MAX_MESSAGE_BYTES = 16 * 1024;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type DecodeResult<M> =
  { ok: true; message: M } | { ok: false; error: { code: ErrorCode; message: string } };

/** Thrown by encode() when our own code builds an invalid or oversized message. */
export class ProtocolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

const utf8 = new TextEncoder();

export function byteLength(text: string): number {
  return utf8.encode(text).length;
}

type SchemaMap = Record<string, z.ZodObject>;

type MessageOf<M extends SchemaMap> = { [K in keyof M]: z.infer<M[K]> }[keyof M];

export type Channel<M extends SchemaMap> = {
  readonly types: readonly (keyof M & string)[];
  decode(raw: string): DecodeResult<MessageOf<M>>;
  encode(message: MessageOf<M>): string;
};

function fail(code: ErrorCode, message: string) {
  return { ok: false as const, error: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createChannel<M extends SchemaMap>(schemas: M): Channel<M> {
  const has = (type: unknown): type is keyof M & string =>
    typeof type === "string" && Object.prototype.hasOwnProperty.call(schemas, type);

  return {
    types: Object.keys(schemas) as (keyof M & string)[],

    decode(raw) {
      try {
        if (typeof raw !== "string") return fail("bad_message", "message must be a string");
        // Cheap bound first: each UTF-16 code unit is at most 3 UTF-8 bytes.
        if (raw.length > MAX_MESSAGE_BYTES || byteLength(raw) > MAX_MESSAGE_BYTES) {
          return fail("too_large", `message is over ${MAX_MESSAGE_BYTES} bytes`);
        }
        let data: unknown;
        try {
          data = JSON.parse(raw);
        } catch {
          return fail("bad_message", "message is not valid JSON");
        }
        if (!isPlainObject(data)) return fail("bad_message", "message must be a JSON object");
        if (data.v !== PROTOCOL_VERSION) {
          return fail("unsupported_version", `expected protocol version ${PROTOCOL_VERSION}`);
        }
        if (!has(data.type)) return fail("unknown_type", "unknown message type");
        const schema = schemas[data.type] as z.ZodObject;
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const where = issue && issue.path.length > 0 ? issue.path.join(".") + ": " : "";
          return fail("bad_message", (where + (issue?.message ?? "invalid message")).slice(0, 200));
        }
        return { ok: true, message: parsed.data as MessageOf<M> };
      } catch {
        return fail("bad_message", "could not decode message");
      }
    },

    encode(message) {
      const type = (message as { type?: unknown }).type;
      if (!has(type)) throw new ProtocolError("unknown_type", `unknown message type: ${String(type)}`);
      const parsed = (schemas[type] as z.ZodObject).safeParse(message);
      if (!parsed.success) {
        throw new ProtocolError("bad_message", `invalid ${type} message: ${parsed.error.issues[0]?.message}`);
      }
      const text = JSON.stringify(parsed.data);
      if (byteLength(text) > MAX_MESSAGE_BYTES) {
        throw new ProtocolError("too_large", `${type} message is over ${MAX_MESSAGE_BYTES} bytes`);
      }
      return text;
    },
  };
}

/** Phone controller → relay. */
export const phoneToRelay = createChannel(phoneToRelaySchemas);
/** Relay → phone controller. */
export const relayToPhone = createChannel(relayToPhoneSchemas);
/** Host app → relay. */
export const hostToRelay = createChannel(hostToRelaySchemas);
/** Relay → host app. */
export const relayToHost = createChannel(relayToHostSchemas);

export type PhoneToRelayMessage = MessageOf<typeof phoneToRelaySchemas>;
export type RelayToPhoneMessage = MessageOf<typeof relayToPhoneSchemas>;
export type HostToRelayMessage = MessageOf<typeof hostToRelaySchemas>;
export type RelayToHostMessage = MessageOf<typeof relayToHostSchemas>;
