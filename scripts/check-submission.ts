// Owner: Yadnesh. `pnpm check:submission` — checks the Kiroween rules we can check from the repo.
// Run it on Tue Dec 1 (code freeze) and again right before submitting.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const check = (name: string, fn: () => true | string) => {
  try {
    const r = fn();
    results.push(r === true ? { name, ok: true } : { name, ok: false, detail: r });
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message.split("\n")[0] });
  }
};
const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tracked = sh("git ls-files").split("\n");
const read = (f: string) => readFileSync(f, "utf8");

check("Repo is public on GitHub", () => {
  const vis = sh("gh repo view Kiroween2026/haunt-kit --json visibility -q .visibility");
  return vis === "PUBLIC" || `visibility is ${vis}`;
});
check("MIT license at the root", () => /MIT License/.test(read("LICENSE")) || "LICENSE is not MIT");
check("GitHub detects the MIT license", () => {
  const key = sh("gh repo view Kiroween2026/haunt-kit --json licenseInfo -q .licenseInfo.key");
  return key === "mit" || `GitHub sees "${key || "none"}"`;
});
check(
  ".kiro/ is committed",
  () => tracked.some((f) => f.startsWith(".kiro/")) || "no tracked files in .kiro/",
);
check(".kiro/ is not ignored", () => {
  try {
    sh("git check-ignore .kiro/steering/product.md");
    return ".kiro is ignored by .gitignore";
  } catch {
    return true;
  }
});
for (const name of ["specs", "steering", "hooks", "agents", "settings"]) {
  check(
    `.kiro/${name}/ has files`,
    () => tracked.some((f) => f.startsWith(`.kiro/${name}/`)) || `nothing in .kiro/${name}/ yet`,
  );
}
check(
  "Two app folders (Skeleton Crew)",
  () =>
    ["apps/seance-party", "apps/steady"].every((d) => existsSync(d) && statSync(d).isDirectory()) ||
    "missing an app folder",
);
check("README has setup steps", () => /pnpm install/.test(read("README.md")) || "no setup steps");
check(
  "README has live URLs",
  () =>
    /https:\/\/[^\s)]*(pages\.dev|workers\.dev)/.test(read("README.md")) ||
    "no pages.dev / workers.dev URL yet",
);
check(
  "Judge testing instructions",
  () => existsSync("docs/JUDGE_TESTING.md") || "docs/JUDGE_TESTING.md missing",
);
check(
  "Judge guide has no team notes left",
  () => !/Team note/.test(read("docs/JUDGE_TESTING.md")) || "remove the 'Team note' block",
);
check("Kiro writeup has no TODOs", () => {
  const n = (read("docs/KIRO_WRITEUP.md").match(/TODO/g) ?? []).length;
  return n === 0 || `${n} TODO sections left`;
});
check("No secrets committed", () => {
  const pattern =
    /(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|HAUNT_DEV_TOKEN=(?!\$\{)[A-Za-z0-9_-]{10,}|CLOUDFLARE_API_TOKEN=\S+)/;
  const hits = tracked.filter(
    (f) => f !== "pnpm-lock.yaml" && existsSync(f) && statSync(f).isFile() && pattern.test(read(f)),
  );
  return hits.length === 0 || `possible secret in: ${hits.join(", ")}`;
});
check("No .env files committed", () => {
  const envs = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"));
  return envs.length === 0 || envs.join(", ");
});
check("Only license-free assets (no stray media files)", () => {
  const media = tracked.filter((f) => /\.(mp3|wav|ogg|m4a|ttf|otf|woff2?|png|jpe?g|gif|mp4)$/i.test(f));
  return media.length === 0 || `review licenses for: ${media.join(", ")}`;
});
check("Tests pass", () => (sh("pnpm -s test 2>&1"), true));
check("Lint and typecheck pass", () => (sh("pnpm -s lint 2>&1"), sh("pnpm -s typecheck 2>&1"), true));

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
