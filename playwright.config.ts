import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}`, actionTimeout: 5_000 },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // e2e never calls a real model: the scripted provider keeps runs deterministic and free.
    command: `npm run build && LLM_PROVIDER=scripted PORT=${PORT} npm start`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
