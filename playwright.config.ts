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
  webServer: [
    { command: "pnpm dev:relay", url: "http://127.0.0.1:8787/health", reuseExistingServer: !process.env.CI },
    {
      command: "pnpm --filter @haunt-kit/controller dev",
      url: "http://localhost:5180/sim.html",
      reuseExistingServer: !process.env.CI,
    },
    { command: "pnpm dev:demo", url: "http://localhost:5181/", reuseExistingServer: !process.env.CI },
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
