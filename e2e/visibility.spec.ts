// The real-database path, run on the same SQL as Neon (PGlite): a check finished by a Quality Technician
// appears on the dashboard right away for a Quality Engineer, together with sample sessions when
// "Include sample data" is on, and without them when it is off. The dashboard is not limited to one person.
import { expect, test } from "@playwright/test";
import { plantDay } from "../lib/shifts";
import { signInAs } from "./auth-helpers";
import { build } from "./fixtures";
import { doSteps, startAt, unique, waitSaved } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("a check finished by a Quality Technician appears at once for a Quality Engineer, with sample data per the switch", async ({ browser }) => {
  const station = unique("Laser cell V · FX-VIS");

  // 1. A Quality Technician signs in, adds a station and finishes a check there.
  const techCtx = await browser.newContext();
  const tech = await techCtx.newPage();
  await signInAs(tech, "technician", "/signin");
  await expect(tech).toHaveURL(/localhost:\d+\/tasks$/);
  // A task at the new station (cell and fixture), started from Sessions.
  const realId = await startAt(tech, station);
  await doSteps(tech, 1, 12);
  await expect(tech.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await waitSaved(tech);

  // A sample session at the same station (test server only: the x-fl-sample header).
  const sampleId = `vis-${Date.now().toString(36)}`;
  const { createdAt, actions } = build(sampleId, { day: plantDay(Date.now() - 86_400_000), time: "10:00", minutes: 40 });
  const meta = { id: sampleId, part: "B-pillar outer", sop: "First-off check, rev A", fixture: station, station, operator: "QT-sample", createdAt };
  const res = await techCtx.request.post(`/api/sessions/${sampleId}/actions`, { data: { meta, actions }, headers: { "x-fl-sample": "1" } });
  expect(res.ok(), await res.text()).toBeTruthy();

  // 2. A Quality Engineer signs in at /dashboard/signin and sees both, with sample data on.
  const engCtx = await browser.newContext();
  const eng = await engCtx.newPage();
  await signInAs(eng, "engineer", "/dashboard/signin");
  await expect(eng).toHaveURL(/\/dashboard$/);
  const q = (sample: 0 | 1) => `/dashboard?station=${encodeURIComponent(station)}&sample=${sample}`;
  await eng.goto(q(1));
  await expect(eng.getByTestId("tile-sessions")).toHaveText("2");
  await expect(eng.locator(`tr[data-session="${realId}"]`)).toBeVisible();
  await expect(eng.locator(`tr[data-session="${realId}"]`)).toContainText("Complete");
  await expect(eng.locator(`tr[data-session="${sampleId}"]`)).toBeVisible();
  await expect(eng.getByTestId("sample-chip")).toHaveText("SAMPLE DATA · 1 real, 1 sample sessions");

  // 3. Sample data off: only the real check.
  await eng.goto(q(0));
  await expect(eng.getByTestId("tile-sessions")).toHaveText("1");
  await expect(eng.locator(`tr[data-session="${realId}"]`)).toBeVisible();
  await expect(eng.locator(`tr[data-session="${sampleId}"]`)).toHaveCount(0);

  // 4. The report of the technician's check opens for the engineer.
  await eng.locator(`tr[data-session="${realId}"]`).getByRole("link").click();
  await expect(eng.getByRole("heading", { name: "Post-session review" })).toBeVisible();
  await expect(eng.getByTestId("report-outcome")).toContainText("Complete");

  await techCtx.close();
  await engCtx.close();
});

test("test mode is shown on every page, and an empty dashboard says it is test mode", async ({ page }) => {
  const banner = page.getByTestId("test-mode-banner");
  await page.goto("/signin");
  await expect(banner).toHaveText("TEST MODE: data is temporary and is not saved to Neon");
  await signInAs(page, "admin", "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/tasks$/);
  for (const path of ["/", "/sessions", "/dashboard"]) {
    await page.goto(path);
    await expect(banner, path).toBeVisible();
  }
  const empty = unique("Laser cell E · FX-EMPTY");
  expect((await page.request.post("/api/stations", { data: { name: empty } })).ok()).toBeTruthy();
  await page.goto(`/dashboard?station=${encodeURIComponent(empty)}`);
  await expect(page.getByTestId("dashboard-empty")).toContainText("Test mode");
  await expect(page.getByText("No sessions at this station yet.")).toHaveCount(0);
});
