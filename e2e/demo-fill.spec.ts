// "Fill demo values": invented values for the open points of the current step, marked demo everywhere.
import { expect, test } from "@playwright/test";
import { DEMO_FILL_NOMINALS, DEMO_FILL_SPREAD } from "../lib/config";
import { STEPS } from "../lib/sop";
import { doSteps, recordValues, startCheck, waitSaved } from "./helpers";

const STATION = "Laser cell 3 · FX-014";

test("Fill demo values in the middle of step 7, then Next step works; demo shows as Demo and D everywhere", async ({ page, request }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 6);
  const step = page.locator("li[aria-current=step]");
  const entry = step.getByTestId("measure-entry");
  await expect(step).toContainText("Record a value for each point, in order. 0 of 14 recorded.");

  // One typed value first; demo fill leaves it alone and fills the rest, in order.
  await recordValues(page, 7, ["H1"], "12.4");
  await expect(entry.getByText("Demo only. Values are invented.")).toBeVisible();
  await entry.getByRole("button", { name: "Fill demo values" }).click();
  await expect(step).toContainText("14 of 14 recorded.");
  await expect(entry.getByRole("button", { name: "Fill demo values" })).toBeDisabled(); // nothing open
  await expect(entry.locator('li[data-point="H1"]')).toHaveText("H1 12.4 mm");
  const h2 = entry.locator('li[data-point="H2"]');
  await expect(h2).toContainText("DEMO");
  const v = Number((await h2.innerText()).match(/H2\s+([\d.]+)/)![1]);
  expect(Math.abs(v - DEMO_FILL_NOMINALS.H)).toBeLessThanOrEqual(DEMO_FILL_SPREAD + 1e-9);

  // The gate is satisfied: Next step leaves the step, with no deviation.
  await step.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText(STEPS[7].name);
  await expect(page.locator("li[aria-current=step]")).toContainText("0 of 8 recorded.");
  await expect(page.getByRole("heading", { name: "Step 7 skipped" })).toHaveCount(0);
  await waitSaved(page);

  // List view: source Demo, and the filter.
  const q = `station=${encodeURIComponent(STATION)}&range=all&shift=all`;
  await page.goto(`/dashboard/measurements?view=list&${q}&source=demo`);
  const demoRows = page.getByTestId("measurements-table").locator(`tr[data-session="${id}"]`);
  await expect(demoRows).toHaveCount(13);
  await expect(demoRows.first()).toContainText("Demo");

  // The session report.
  await page.goto(`/dashboard/${id}`);
  const report = page.getByTestId("report-measurements-table");
  await expect(report.locator('tr[data-point="H1"]')).toContainText("Typed");
  await expect(report.locator('tr[data-point="H2"]')).toContainText("Demo");

  // The line view: D on demo values only.
  await page.goto(`/dashboard/measurements?${q}`);
  const row = page.locator(`tr[data-session="${id}"]`);
  await expect(row.locator('td[data-point="H1"]')).toHaveText("12.4");
  await expect(row.locator('td[data-point="H2"]')).toHaveText(/^[\d.]+D$/);

  // CSVs: the list shows source Demo with its note; the wide one marks D.
  const list = await (await request.get(`/api/measurements/csv?view=list&${q}&source=demo`)).text();
  const mine = list.split("\r\n").filter((l) => l.includes(id));
  expect(mine).toHaveLength(13);
  expect(mine.every((l) => l.includes(",Demo,") && l.endsWith('"Demo value, not a measurement"'))).toBe(true);
  const wide = (await (await request.get(`/api/measurements/csv?${q}`)).text()).split("\r\n");
  const head = wide[0].split(",");
  const cells = wide.find((l) => l.includes(id))!.split(",");
  expect(cells[head.indexOf("H1_mm")]).toBe("12.4");
  expect(cells[head.indexOf("H2_mm")]).toMatch(/^[\d.]+D$/);
  expect(wide.find((l) => l.includes(id))!.endsWith('"Includes demo values, not measurements"')).toBe(true);
});
