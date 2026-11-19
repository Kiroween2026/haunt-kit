// Owner: Yadnesh. Séance MCP server over stdio. Registered in .kiro/settings/mcp.json.
// stdout is the MCP channel: log only to stderr, and never log the token.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readEnvLocal } from "@haunt-kit/relay/node";
import { AdminClient } from "./admin-client";
import { SeanceTools, registerSeanceTools } from "./tools";

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const root = repoRoot();
const relayHttp = process.env.HAUNT_RELAY_URL ?? "http://127.0.0.1:8787";
const relayWs = relayHttp.replace(/^http/, "ws");
const token = process.env.HAUNT_DEV_TOKEN || readEnvLocal("HAUNT_DEV_TOKEN", root);

const tools = new SeanceTools({
  admin: new AdminClient(relayHttp, token),
  relayWsUrl: relayWs,
  recordingsDir: process.env.HAUNT_RECORDINGS_DIR ?? join(root, "recordings"),
});
const server = new McpServer({ name: "seance", version: "0.1.0" });
registerSeanceTools(server, tools);
await server.connect(new StdioServerTransport());
console.error(
  `seance MCP ready (relay ${relayHttp}, dev token ${token ? "found" : "MISSING: run pnpm dev:token"})`,
);

const stop = () => {
  tools.dispose();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
