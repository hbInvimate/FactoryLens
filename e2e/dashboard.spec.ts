// Supervisor dashboard, phase 1: stations, navigation, /dashboard tiles and table, /dashboard/[id] report.
import { expect, test, type Page } from "@playwright/test";
import { shiftOf } from "../lib/shifts";
import { decideHold, doSteps, lodge, openDashboard, startAt, tap, unique, waitSaved } from "./helpers";

/** Step 7: H9 to H12 skipped, then fixed. */
async function skipHolesThenFix(page: Page) {
  await tap(page, 7, ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H13", "H14"]);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await tap(page, 7, ["H9", "H10", "H11", "H12"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();
}

/** Step 5: C4 before C3, then released and closed in order. */
async function wrongClampsThenFix(page: Page) {
  await tap(page, 5, ["C1", "C2", "C4"]);
  await page.getByRole("button", { name: "Release all clamps" }).click();
  await tap(page, 5, ["C1", "C2", "C3", "C4", "C5", "C6"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();
}

test("Station list: seeded station, Add a station, empty station on the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Cell and fixture", { exact: true })).toHaveValue("Laser cell 3 · FX-014");
  const name = unique("Laser cell 9 · FX-EMPTY");
  await page.getByLabel("Cell and fixture", { exact: true }).selectOption("__add__");
  await page.getByLabel("New station: cell and fixture").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Cell and fixture", { exact: true })).toHaveValue(name);

  await openDashboard(page, name);
  // The tests run in test mode (FL_STORAGE=memory), so the empty dashboard says so.
  await expect(page.getByTestId("dashboard-empty")).toHaveText("Test mode: nothing at this station in the temporary test database.");
});

test("One deviation fixed scores 92% on the dashboard and in the report", async ({ page }) => {
  const station = unique("Laser cell 4 · FX-ONE");
  const id = await startAt(page, station);
  await doSteps(page, 1, 6);
  await skipHolesThenFix(page);
  await doSteps(page, 8, 12);
  await waitSaved(page);

  await openDashboard(page, station);
  await expect(page.getByTestId("tile-sessions")).toHaveText("1");
  await expect(page.getByTestId("tile-conformance")).toHaveText("92%");
  await expect(page.getByTestId("tile-no-deviation")).toHaveText("0%");
  await expect(page.getByTestId("tile-check-time")).toHaveText(/^\d+:\d\d$/);
  await expect(page.locator(`tr[data-session="${id}"]`).getByTestId("row-conformance")).toHaveText("92%");

  await page.locator(`tr[data-session="${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${id}(\\?|$)`));
  await expect(page.getByTestId("report-conformance")).toHaveText("92%");
  await expect(page.getByTestId("report-correct")).toHaveText("11 of 12");
  await expect(page.getByTestId("report-deviations")).toHaveText("1");
  await expect(page.getByTestId("report-outcome")).toContainText("Complete");
  const step7 = page.locator('tr[data-step="7"]');
  await expect(step7).toContainText("Check holes H1 to H14 with check pins");
  await expect(step7).toContainText("Skipped");
  await expect(step7).toContainText("Corrected after 1 correction");
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
  await doSteps(page, 6, 6);
  await skipHolesThenFix(page);
  await doSteps(page, 8, 12);
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
  await doSteps(page, 1, 6);
  await skipHolesThenFix(page);
  await doSteps(page, 8, 12);
  await waitSaved(page);
  const clean = await startAt(page, station);
  await doSteps(page, 1, 12);
  await waitSaved(page);

  await page.goto(`/dashboard?station=${encodeURIComponent(station)}&range=7&sample=1`);
  await expect(page.getByTestId("sample-chip")).toHaveText("SAMPLE DATA · 2 real, 0 sample sessions");
  await expect(page.getByTestId("conformance-overall")).toContainText("Overall 96% over 2 completed sessions");

  const block3 = page.getByTestId("block-deviations");
  const step7 = block3.locator('[data-step="7"]');
  await expect(step7.getByTestId("step-count")).toHaveText("1");
  for (const h of ["H9", "H10", "H11", "H12"]) await expect(step7.locator(`[data-item="${h} not checked"]`)).toContainText("1");

  await step7.getByRole("link").click();
  await expect(page).toHaveURL(/dev=7/);
  await expect(page.getByTestId("dev-filter-chip")).toHaveText(/Filter: Step 7 deviations/);
  await expect(page.locator(`tr[data-session="${skipped}"]`)).toBeVisible();
  await expect(page.locator(`tr[data-session="${clean}"]`)).toHaveCount(0);
  await page.getByTestId("dev-filter-chip").click();
  await expect(page).not.toHaveURL(/dev=7/);
  await expect(page.locator(`tr[data-session="${clean}"]`)).toBeVisible();

  // Shift filter: the shift these sessions started in, then another one.
  const mine = shiftOf(Date.now() - 2 * 60_000);
  const other = mine === "A" ? "B" : "A";
  await page.getByLabel("Shift", { exact: true }).selectOption(mine);
  await expect(page).toHaveURL(new RegExp(`shift=${mine}`));
  await expect(page.getByTestId("tile-sessions")).toHaveText("2");
  // Block 2 still shows all three shifts, the others dimmed.
  await expect(page.getByTestId("block-shifts").locator(`[data-shift="${other}"]`)).toHaveClass(/opacity-40/);
  await expect(page.getByTestId("block-shifts").locator(`[data-shift="${mine}"]`)).not.toHaveClass(/opacity-40/);
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
  await expect(page.getByTestId("tile-sessions-split")).toHaveText("1 complete · 0 on hold · 1 ended without a check · 0 left");
  await expect(page.getByTestId("tile-conformance")).toHaveText("100%");
  await expect(page.getByText("steps correct first time, 1 complete session")).toBeVisible();
  await expect(page.getByText("complete sessions, without pauses and holds (1)")).toBeVisible();
  await expect(page.locator(`tr[data-session="${held}"]`).getByTestId("row-conformance")).toHaveText("Not scored");
  await expect(page.locator(`tr[data-session="${clean}"]`).getByTestId("row-conformance")).toHaveText("100%");

  await page.locator(`tr[data-session="${held}"]`).click();
  await expect(page.getByTestId("report-conformance")).toHaveText("Not scored");
  await expect(page.getByTestId("report-outcome")).toContainText("Part scrapped, not scored");
  await expect(page.getByTestId("report-outcome")).toContainText("Crack seen in the part");
  await expect(page.locator('tr[data-step="3"]')).toContainText("Stopped");
});
