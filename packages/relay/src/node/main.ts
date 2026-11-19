// Owner: Yadnesh. `pnpm dev:relay` entry point.

import { startNodeRelay } from "./server";
import { devToken } from "./env";

const production = process.env.NODE_ENV === "production";
const token = devToken();
const relay = await startNodeRelay({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? (production ? "0.0.0.0" : "127.0.0.1"),
  ...(token ? { devToken: token } : {}),
  production,
});

// Never print the token itself.
console.log(
  `Haunt Kit relay on ${relay.wsUrl}  (admin API for the Séance MCP: ${relay.adminEnabled ? "on" : "off"})`,
);
if (!relay.adminEnabled && !production) {
  console.log(
    token
      ? "Admin API is off because HOST is not loopback."
      : "Run `pnpm dev:token` once to turn on the admin API.",
  );
}

const stop = () => relay.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
