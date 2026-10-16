import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } };
const admin = { ...desktop, storageState: "e2e/.auth/admin.json" };
const SOP_DRAFT_SPECS = [/sop-analysis\.spec\.ts/, /sop-review\.spec\.ts/, /sop-activate\.spec\.ts/, /sop-update\.spec\.ts/];

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
    { name: "chromium", dependencies: ["setup"], testIgnore: SOP_DRAFT_SPECS, use: { ...admin } },
    // These change the one open SOP Draft on the test server, so they run after the rest, one file at a time.
    { name: "sop-analysis", dependencies: ["chromium"], testMatch: /sop-analysis\.spec\.ts/, use: { ...admin } },
    { name: "sop-review", dependencies: ["sop-analysis"], testMatch: /sop-review\.spec\.ts/, use: { ...admin } },
    // Last: it changes the Active revision that every new check uses.
    { name: "sop-activate", dependencies: ["sop-review"], testMatch: /sop-activate\.spec\.ts/, use: { ...admin } },
    { name: "sop-update", dependencies: ["sop-activate"], testMatch: /sop-update\.spec\.ts/, use: { ...admin } },
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
