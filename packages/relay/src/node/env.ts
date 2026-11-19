// Owner: Yadnesh. Reads HAUNT_DEV_TOKEN from the environment, or from the git-ignored .env.local.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Walks up from `start` to find .env.local and returns the value of `key`, if any. */
export function readEnvLocal(key: string, start = process.cwd()): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const file = join(dir, ".env.local");
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && m[1] === key) return m[2]!.replace(/^["']|["']$/g, "");
      }
      return undefined;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function devToken(): string | undefined {
  return process.env.HAUNT_DEV_TOKEN || readEnvLocal("HAUNT_DEV_TOKEN");
}
