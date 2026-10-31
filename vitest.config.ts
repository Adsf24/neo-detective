import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "cases/*/**/*.test.ts"],
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
