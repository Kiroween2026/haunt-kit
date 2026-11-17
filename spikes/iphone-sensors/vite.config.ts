import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // Listen on all network addresses (0.0.0.0) for tunnel and local testing
    port: 5173,
    allowedHosts: [
      "laws-incredible-explaining-eng.trycloudflare.com",
      "conditions-trim-concert-outdoor.trycloudflare.com",
      "elegant-staying-setup-frost.trycloudflare.com",
    ],
  },
});
