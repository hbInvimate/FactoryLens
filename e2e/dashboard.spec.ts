// Supervisor dashboard, phase 1: stations, navigation, /dashboard tiles and table, /dashboard/[id] report.
import { expect, test, type Page } from "@playwright/test";
import { shiftOf } from "../lib/shifts";
import { decideHold, doSteps, lodge, openDashboard, startAt, tap, unique, waitSaved } from "./helpers";

/** Step 11: V4 and V5 skipped, then looked over. (Steps 7 to 10 need a value per point, so they cannot be skipped.) */
async function skipVisualThenFix(page: Page) {
  await tap(page, 11, ["V1", "V2", "V3"]);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await tap(page, 11, ["V4", "V5"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();
}

/** Step 5: C4 before C3, then released and closed in order. */
async function wrongClampsThenFix(page: Page) {
  await tap(page, 5, ["C1", "C2", "C4"]);
  await page.getByRole("button", { name: "Release all clamps" }).click();
  await tap(page, 5, ["C1", "C2", "C3", "C4", "C5", "C6"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();
}

test("Station list: seeded station, a station added, empty station on the dashboard", async ({ page }) => {
  const name = unique("Laser cell 9 · FX-EMPTY");
  expect((await page.request.post("/api/stations", { data: { name } })).ok()).toBeTruthy();
  const { stations } = (await (await page.request.get("/api/stations")).json()) as { stations: string[] };
  expect(stations).toContain("Laser cell 3 · FX-014");
  expect(stations).toContain(name);

  await openDashboard(page, name);
  // The tests run in test mode (FL_STORAGE=memory), so the empty dashboard says so.
  await expect(page.getByTestId("dashboard-empty")).toHaveText("Test mode: nothing at this station in the temporary test database.");
});

test("One deviation fixed scores 92% on the dashboard and in the report", async ({ page }) => {
  const station = unique("Laser cell 4 · FX-ONE");
  const id = await startAt(page, station);
  await doSteps(page, 1, 10);
  await skipVisualThenFix(page);
  await doSteps(page, 12, 12);
  await waitSaved(page);

  await openDashboard(page, station);
  await expect(page.getByTestId("tile-sessions")).toHaveText("1");
  await expect(page.getByTestId("tile-conformance")).toHaveText("92%");
  await expect(page.getByTestId("conformance-squares").locator("[data-step]")).toHaveCount(12);
  await expect(page.getByTestId("tile-check-time")).toHaveText(/^\d+:\d\d$/);
  await expect(page.locator(`tr[data-session="${id}"]`).getByTestId("row-conformance")).toHaveText("92%");

  await page.locator(`tr[data-session="${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${id}(\\?|$)`));
  await expect(page.getByTestId("report-conformance")).toHaveText("92%");
  await expect(page.getByTestId("report-correct")).toHaveText("11 of 12");
  await expect(page.getByTestId("report-deviations")).toHaveText("1");
  await expect(page.getByTestId("report-outcome")).toContainText("Complete");
  const step11 = page.locator('tr[data-step="11"]');
  await expect(step11).toContainText("Look over the whole part");
  await expect(step11).toContainText("Skipped");
  await expect(step11).toContainText("Corrected after 1 correction");
  await expect(page.locator('tr[data-step="6"]')).toContainText("Passed");
  await expect(page.getByTestId("steps-table")).not.toContainText("SOP step");
  await expect(page.getByRole("button", { name: "Send to quality system" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Replay this session" })).toBeDisabled();
  await expect(page.getByText("Coming later")).toBeVisible();
});

test("Two deviations fixed score 83%", async ({ page }) => {
  const station = unique("Laser cell 5 · FX-TWO");
  const id = await startAt(page, station);
  await doSteps(page, 1, 4);
  await wrongClampsThenFix(page);
  await doSteps(page, 6, 10);
  await skipVisualThenFix(page);
  await doSteps(page, 12, 12);
  await waitSaved(page);

  await openDashboard(page, station);
  await expect(page.getByTestId("tile-conformance")).toHaveText("83%");
  await page.locator(`tr[data-session="${id}"]`).click();
  await expect(page.getByTestId("report-conformance")).toHaveText("83%");
  await expect(page.getByTestId("report-correct")).toHaveText("10 of 12");
  await expect(page.getByTestId("report-deviations")).toHaveText("2");
  await expect(page.locator('tr[data-step="5"]')).toContainText("Incorrect");
});

test("Blocks: click a step to filter the sessions table, remove the chip, shift filter, sample chip counts", async ({ page }) => {
  const station = unique("Laser cell 2 · FX-BLOCKS");
  const skipped = await startAt(page, station);
  await doSteps(page, 1, 10);
  await skipVisualThenFix(page);
  await doSteps(page, 12, 12);
  await waitSaved(page);
  const clean = await startAt(page, station);
  await doSteps(page, 1, 12);
  await waitSaved(page);

  await page.goto(`/dashboard?station=${encodeURIComponent(station)}&range=7&sample=1`);
  await expect(page.getByTestId("sample-chip")).toHaveText("SAMPLE DATA · 2 real, 0 sample sessions");
  await expect(page.getByTestId("tile-conformance")).toHaveText("96%");

  const block3 = page.getByTestId("block-deviations");
  const step11 = block3.getByTestId("deviation-rows").locator('[data-row="11"]');
  await expect(step11.getByTestId("hotspot-count")).toHaveText("1");
  for (const v of ["V4", "V5"]) await expect(step11.locator(`[data-tag="${v} not checked"]`)).toHaveText(`${v} not checked ×1`);

  await step11.getByRole("link").click();
  await expect(page).toHaveURL(/dev=11/);
  await expect(page.getByTestId("dev-filter-chip")).toHaveText(/Filter: Step 11 deviations/);
  await expect(page.locator(`tr[data-session="${skipped}"]`)).toBeVisible();
  await expect(page.locator(`tr[data-session="${clean}"]`)).toHaveCount(0);
  await page.getByTestId("dev-filter-chip").click();
  await expect(page).not.toHaveURL(/dev=11/);
  await expect(page.locator(`tr[data-session="${clean}"]`)).toBeVisible();

  // Shift filter: the shift these sessions started in, then another one.
  const mine = shiftOf(Date.now() - 2 * 60_000);
  const other = mine === "A" ? "B" : "A";
  await page.getByLabel("Shift", { exact: true }).selectOption(mine);
  await expect(page).toHaveURL(new RegExp(`shift=${mine}`));
  await expect(page.getByTestId("tile-sessions")).toHaveText("2");
  // Block 2 still shows all three shifts, the others dimmed.
  await expect(page.getByTestId("block-shifts").locator(`[data-shift="${other}"]`).first()).toHaveClass(/opacity-40/);
  await expect(page.getByTestId("block-shifts").locator(`[data-shift="${mine}"]`).first()).not.toHaveClass(/opacity-40/);
  await page.getByLabel("Shift", { exact: true }).selectOption(other);
  await expect(page).toHaveURL(new RegExp(`shift=${other}`));
  await expect(page.getByTestId("dashboard-empty")).toBeVisible();
});

test("A scrapped session shows Not scored and is left out of conformance and check time", async ({ page }) => {
  const station = unique("Laser cell 6 · FX-HELD");
  const clean = await startAt(page, station);
  await doSteps(page, 1, 12);
  await waitSaved(page);

  const held = await startAt(page, station);
  await doSteps(page, 1, 2);
  await lodge(page, /Lower the part onto pads P1 to P3/, "Crack seen in the part");
  await page.getByRole("button", { name: "Next: mark and hand off" }).click();
  await decideHold(page, "Part scrapped", "Quality", "Crack confirmed");
  await expect(page.getByRole("heading", { name: "Part scrapped" })).toBeVisible();
  await waitSaved(page);

  await openDashboard(page, station);
  await expect(page.getByTestId("tile-sessions")).toHaveText("2");
  await expect(page.getByTestId("tile-sessions-split")).toHaveText("1 complete · 1 ended without a check · 0 left · 0 running");
  await expect(page.getByTestId("tile-conformance")).toHaveText("100%");
  await expect(page.locator(`tr[data-session="${held}"]`).getByTestId("row-conformance")).toHaveText("Not scored");
  await expect(page.locator(`tr[data-session="${clean}"]`).getByTestId("row-conformance")).toHaveText("100%");

  await page.locator(`tr[data-session="${held}"]`).click();
  await expect(page.getByTestId("report-conformance")).toHaveText("Not scored");
  await expect(page.getByTestId("report-outcome")).toContainText("Part scrapped, not scored");
  await expect(page.getByTestId("report-outcome")).toContainText("Crack seen in the part");
  await expect(page.locator('tr[data-step="3"]')).toContainText("Stopped");
});
