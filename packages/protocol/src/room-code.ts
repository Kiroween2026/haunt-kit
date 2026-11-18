// Owner: Yadnesh. Room codes: 4 uppercase letters without O, I and L (easy to read and type).

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

/** Fills the array with random bytes. Defaults to crypto.getRandomValues. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => void;

const defaultRandom: RandomBytes = (bytes) => {
  crypto.getRandomValues(bytes);
};

// Largest multiple of 23 that fits in a byte (23 * 11 = 253). Bytes at or above it are
// rejected, so `byte % 23` gives every letter the same chance (no modulo bias).
const ACCEPT_BELOW = Math.floor(256 / ROOM_CODE_ALPHABET.length) * ROOM_CODE_ALPHABET.length;

export function generateRoomCode(random: RandomBytes = defaultRandom): string {
  let code = "";
  const buffer = new Uint8Array(16);
  // Each byte is accepted with probability 253/256, so this loop almost always runs once.
  // The cap stops a broken random source from looping forever.
  for (let round = 0; round < 1000 && code.length < ROOM_CODE_LENGTH; round++) {
    random(buffer);
    for (const byte of buffer) {
      if (byte < ACCEPT_BELOW) {
        code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
        if (code.length === ROOM_CODE_LENGTH) return code;
      }
    }
  }
  throw new Error("Random source produced no usable bytes");
}

export function isRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}

/** Turns typed input like " abcd " into "ABCD". Returns null if it isn't a valid room code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.replace(/\s+/g, "").toUpperCase();
  return isRoomCode(code) ? code : null;
}
