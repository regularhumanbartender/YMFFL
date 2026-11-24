import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4175/YMFFL/",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    {
      name: "small-mobile",
      use: { viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "npm --prefix website run dev -- --port 4175 --strictPort --host 127.0.0.1",
    env: { SITE_BASE_PATH: "/YMFFL/" },
    url: "http://127.0.0.1:4175/YMFFL/",
    reuseExistingServer: !process.env.CI,
  },
});
