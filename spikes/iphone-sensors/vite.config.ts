import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // Listen on all network addresses (0.0.0.0) for tunnel and local testing
    port: 5173,
    allowedHosts: [".trycloudflare.com"], // any cloudflared quick tunnel
  },
});
