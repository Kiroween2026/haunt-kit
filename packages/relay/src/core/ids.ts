// Owner: Yadnesh. Random ids and constant-time comparison.

import type { RandomBytes } from "@haunt-kit/protocol";

const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const defaultRandom: RandomBytes = (bytes) => {
  crypto.getRandomValues(bytes);
};

/** A random id of URL-safe characters. 64 symbols, so `byte & 63` has no bias. */
export function randomId(length: number, random: RandomBytes = defaultRandom): string {
  const bytes = new Uint8Array(length);
  random(bytes);
  let id = "";
  for (const byte of bytes) id += URL_SAFE[byte & 63];
  return id;
}

/** Compares two strings in time that depends only on their lengths, not on where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
