// Owner: Yadnesh. `pnpm dev:token`: writes a random HAUNT_DEV_TOKEN to .env.local (git-ignored).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const file = join(process.cwd(), ".env.local");
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
if (/^\s*HAUNT_DEV_TOKEN\s*=/m.test(current)) {
  console.log(".env.local already has HAUNT_DEV_TOKEN. Nothing changed.");
} else {
  const line = `HAUNT_DEV_TOKEN=${randomBytes(24).toString("base64url")}\n`;
  writeFileSync(file, current + (current && !current.endsWith("\n") ? "\n" : "") + line, { mode: 0o600 });
  console.log("Wrote HAUNT_DEV_TOKEN to .env.local (git-ignored). Restart the relay and Kiro.");
}
