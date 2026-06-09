import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:5100",
    // Keep traces on first retry so failures are diagnosable
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Respect prefers-reduced-motion so Framer Motion skips animations in tests
    // (prevents blank-page screenshots from catching opacity:0 initial state)
    reducedMotion: "reduce",
  },

  projects: [
    {
      name: "iPhone 12",
      use: { ...devices["iPhone 12"] },
    },
    {
      name: "iPhone SE",
      use: { ...devices["iPhone SE"] },
    },
    {
      name: "Pixel 5",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Galaxy S9+",
      use: { ...devices["Galaxy S9+"] },
    },
  ],

  // Start the Vite dev server automatically before tests run
  // Use port 5100 to avoid conflict with macOS ControlCenter on 5000
  webServer: {
    command: "VITE_PORT=5100 npm run dev",
    url: "http://localhost:5100",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
