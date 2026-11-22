import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/**/*.test.ts",

      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
      "apps/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.tsx",
    ],
  },
});
