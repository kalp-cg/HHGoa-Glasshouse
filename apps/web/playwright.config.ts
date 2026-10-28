// Playwright docs: https://playwright.dev/docs/test-configuration (@playwright/test 1.64.1)
import { defineConfig } from "@playwright/test";

const PORT = 3123;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "projector", use: { viewport: { width: 1280, height: 720 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  // the API runs on the engine (OFFLINE_MODE), so the test needs no network
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { OFFLINE_MODE: "true" },
  },
});
