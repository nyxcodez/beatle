import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
