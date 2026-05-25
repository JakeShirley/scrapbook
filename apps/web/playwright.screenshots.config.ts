import { defineConfig, devices } from "@playwright/test";

const port = 5174;

export default defineConfig({
  testDir: "./screenshots",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  outputDir: "./test-results/screenshots",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port}`,
    reuseExistingServer: !process.env.CI,
    url: `http://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
