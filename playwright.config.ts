import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4184",
    // Tracing on Windows intermittently fails while closing the browser context
    // with ENOENT, which masks whether the test assertions passed. Screenshots
    // and the HTML report remain enabled for failures.
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4184",
    url: "http://127.0.0.1:4184",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
