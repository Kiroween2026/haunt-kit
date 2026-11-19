import { resolve } from "node:path";
import { defineConfig } from "vite";

// Dev: the page and the relay share one origin. /relay is proxied (with WebSockets) to the
// Node relay on :8787, so a single `cloudflared tunnel --url http://localhost:5180` gives
// the iPhone HTTPS for both. sim.html is the no-phone desktop simulator.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        sim: resolve(import.meta.dirname, "sim.html"),
      },
    },
  },
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/relay": {
        target: "http://127.0.0.1:8787",
        ws: true,
        rewrite: (path) => path.replace(/^\/relay/, ""),
      },
    },
  },
});
