import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } };

// Runs against a production build (`npm run build` first) with the in-memory store,
// so the tests never touch the database in DATABASE_URL.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  // Generous: under a full parallel run the in-process Postgres can be slow to answer.
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1600, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    // Signs in the test admin once (e2e/auth.setup.ts); every other test starts with that cookie.
    { name: "setup", testMatch: /auth\.setup\.ts/, use: desktop },
    { name: "chromium", dependencies: ["setup"], use: { ...desktop, storageState: "e2e/.auth/admin.json" } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // The in-memory database creates the test accounts in lib/auth/testUsers.ts. Nothing reaches Neon.
    env: { FL_STORAGE: "memory" },
    timeout: 60_000,
  },
});
