import { defineConfig, devices } from "@playwright/test";

// End-to-end tests on WebKit (Safari's engine, our iPhones) and Chromium (Android, desktop).
// Starts the Node relay and the controller; tests create rooms and ghost players themselves.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  // Servers run as plain `node` processes (no pnpm wrapper) so they stop cleanly when the
  // tests end. Through `pnpm`, CI once finished all tests and then hung waiting for them.
  globalTimeout: 10 * 60_000,
  webServer: [
    {
      command: "node --import tsx packages/relay/src/node/main.ts",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: "node packages/controller/node_modules/vite/bin/vite.js packages/controller",
      url: "http://localhost:5180/sim.html",
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: "node packages/ui/node_modules/vite/bin/vite.js packages/ui/demo",
      url: "http://localhost:5182/",
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: "node apps/seance-party/node_modules/vite/bin/vite.js apps/seance-party",
      url: "http://localhost:5183/",
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: "node apps/steady/node_modules/vite/bin/vite.js apps/steady",
      url: "http://localhost:5184/",
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      command: "node packages/host-sdk/node_modules/vite/bin/vite.js packages/host-sdk/demo",
      url: "http://localhost:5181/",
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Chrome now has DeviceMotionEvent.requestPermission too; without these it answers "denied".
        permissions: ["accelerometer", "gyroscope", "magnetometer", "microphone"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
