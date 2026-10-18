// Measurements, part 1: typed values at steps 7 to 10 (stored, never judged), the dashboard table and the report.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { STEPS } from "../lib/sop";
import { signInAs } from "./auth-helpers";
import { doSteps, grid, recordValues, startCheck, waitSaved } from "./helpers";

test.describe.configure({ mode: "serial" });

let sessionId = "";
const STATION = "Laser cell 3 · FX-014";

test("required values at step 7: the gate, the order, the prompt and a correction that does not double count", async ({ page }) => {
  sessionId = await startCheck(page);
  await doSteps(page, 1, 6);
  const step = page.locator("li[aria-current=step]");
  const entry = step.getByTestId("measure-entry");
  const prompt = entry.getByTestId("measure-prompt");
  await expect(entry.getByLabel("Step 7 point to record")).toHaveValue("H1");
  await expect(prompt).toHaveCount(0);

  // The gate: Next step does not leave the step and raises no deviation; the prompt names the first missing point.
  await step.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(prompt).toHaveText("Measurement required. Record the value for H1 to continue.");
  await expect(step).toContainText(STEPS[6].name);
  await expect(page.getByRole("heading", { name: "Step 7 skipped" })).toHaveCount(0);

  // Not a number: refused.
  await entry.getByRole("button", { name: "Record value" }).click();
  await expect(entry.getByTestId("measure-error")).toHaveText("Enter a number, for example 12.4.");
  await entry.getByLabel("Value for H1 in mm").fill("abc");
  await entry.getByRole("button", { name: "Record value" }).click();
  await expect(entry.getByTestId("measure-error")).toHaveText("Enter a number, for example 12.4.");

  await recordValues(page, 7, ["H1", "H2"], "12,4");
  await expect(entry.locator('li[data-point="H1"]')).toHaveText("H1 12.4 mm");
  await expect(step).toContainText("2 of 14"); // the values confirmed H1 and H2
  await expect(prompt).toHaveCount(0);

  // Order: a later point cannot be recorded or confirmed. Tapping H5 asks for H3; H5 is not even offered.
  await grid(page, 7).getByRole("button", { name: "H5", exact: true }).click();
  await expect(prompt).toHaveText("Measurement required. Record the value for H3 to continue.");
  await expect(step).toContainText("2 of 14");
  await expect(entry.getByLabel("Step 7 point to record").locator("option")).toHaveText(["H3", "H1 (recorded, correct it)", "H2 (recorded, correct it)"]);

  // A correction: tap the recorded H1, record again. A new row; the point is not counted twice.
  await grid(page, 7).getByRole("button", { name: "H1", exact: true }).click();
  await expect(entry.getByLabel("Step 7 point to record")).toHaveValue("H1");
  await entry.getByLabel("Value for H1 in mm").fill("12.5");
  await entry.getByRole("button", { name: "Record value" }).click();
  await expect(entry.locator('li[data-point="H1"]')).toHaveText("H1 12.5 mm");
  await expect(step).toContainText("2 of 14");
  await expect(entry.getByLabel("Step 7 point to record")).toHaveValue("H3");

  // The rest, in order; then the step can be left, with no deviation.
  await recordValues(page, 7, STEPS[6].points.slice(2));
  await step.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText(STEPS[7].name);
  await expect(page.getByRole("heading", { name: "Step 7 skipped" })).toHaveCount(0);
  await waitSaved(page);
});

test("steps 8 to 10 are gated the same way; step 11 is not", async ({ page }) => {
  await page.goto(`/check/${sessionId}`);
  const step = page.locator("li[aria-current=step]");
  for (const n of [8, 9, 10]) {
    await expect(step).toContainText(STEPS[n - 1].name);
    await step.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(step.getByTestId("measure-prompt")).toHaveText(`Measurement required. Record the value for ${STEPS[n - 1].points[0]} to continue.`);
    await recordValues(page, n, STEPS[n - 1].points);
    await step.getByRole("button", { name: "Next step", exact: true }).click();
  }
  // Step 11: visual points, tapped as before; no value panel.
  await expect(step).toContainText(STEPS[10].name);
  await expect(step.getByTestId("measure-entry")).toHaveCount(0);
  await waitSaved(page);
});
test("the server refuses values outside steps 7 to 10", async ({ request }) => {
  const id = crypto.randomUUID();
  const meta = { id, part: "p", sop: "First-off check, rev A", fixture: STATION, operator: "x", createdAt: Date.now() - 1000 };
  const bad = { id: `${id}-1`, seq: 1, at: Date.now() - 500, type: "measure", step: 5, point: "C1", value: 1, unit: "mm", source: "typed", heard: "1", confidence: null, status: "recorded" };
  expect((await request.post(`/api/sessions/${id}/actions`, { data: { meta, actions: [bad] } })).status()).toBe(400);
});

test("the report shows the measurements of the session, corrections included", async ({ page }) => {
  await page.goto(`/dashboard/${sessionId}`);
  const h1 = page.getByTestId("report-measurements-table").locator('tbody tr[data-point="H1"]');
  await expect(h1).toHaveCount(2); // the first value and its correction
  await expect(h1.first()).toContainText("12.4");
  await expect(h1.nth(1)).toContainText("12.5");
  await expect(page.getByTestId("report-measurements-table").locator('tbody tr')).toHaveCount(2 + 13 + 8 + 14 + 4);
  await expect(page.getByTestId("report-measurements")).toContainText("not a validated record");
});

async function postMany(request: APIRequestContext, station: string, n: number): Promise<string> {
  const id = crypto.randomUUID();
  const t0 = Date.now() - 3_600_000;
  const meta = { id, part: "p", sop: "First-off check, rev A", fixture: station, station, operator: "x", createdAt: t0 };
  const points = STEPS[6].points;
  const actions = Array.from({ length: n }, (_, i) => ({
    id: `${id}-m${i}`, seq: i + 1, at: t0 + 1000 * (i + 1), type: "measure", step: 7, point: points[i % points.length],
    value: 10 + i / 10, unit: "mm", source: i % 5 === 0 ? "voice" : "typed", heard: String(10 + i / 10), confidence: i % 5 === 0 ? 0.9 : null, status: "recorded",
  }));
  expect((await request.post(`/api/sessions/${id}/actions`, { data: { meta, actions } })).ok()).toBeTruthy();
  return id;
}

test("the dashboard table: filters, sorting, paging and CSV export", async ({ page, request }) => {
  const station = `Laser cell M · FX-${Math.random().toString(36).slice(2, 7)}`;
  expect((await request.post("/api/stations", { data: { name: station } })).ok()).toBeTruthy();
  const id = await postMany(request, station, 55);
  const q = (extra = "") => `/dashboard/measurements?view=list&station=${encodeURIComponent(station)}&range=all&shift=all${extra}`;

  await page.goto(q());
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Measurements" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("measurement-count")).toContainText("55 values, page 1 of 2");
  await expect(page.getByTestId("measurements-table").locator("tbody tr")).toHaveCount(50);
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByTestId("measurements-table").locator("tbody tr")).toHaveCount(5);

  // Sorting by value, smallest first.
  await page.goto(q("&sort=value&dir=asc"));
  await expect(page.getByTestId("measurements-table").locator("tbody tr").first().getByTestId("value")).toHaveText("10");
  await page.goto(q("&sort=value&dir=desc"));
  await expect(page.getByTestId("measurements-table").locator("tbody tr").first().getByTestId("value")).toHaveText("15.4");

  // Filters: source and step.
  await page.goto(q("&source=voice"));
  await expect(page.getByTestId("measurement-count")).toContainText("11 values");
  await page.goto(q("&step=8"));
  await expect(page.getByTestId("measurements-empty")).toBeVisible();
  await page.goto(q());
  await page.getByLabel("Source").selectOption("typed");
  await expect(page.getByTestId("measurement-count")).toContainText("44 values");

  // CSV: every row of the view, with the note.
  const csv = await (await request.get(`/api/measurements/csv?view=list&station=${encodeURIComponent(station)}&range=all&shift=all`)).text();
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe("recorded_at,technician,station,session,step,point,value,unit,source,status,text_heard,note");
  expect(lines).toHaveLength(56);
  expect(csv).toContain(`,${id},7,H1,10,mm,voice,recorded,10,"Voice-entered, not a validated record"`);
  expect(lines.some((l) => l.includes(",typed,") && l.endsWith("Typed, not a validated record\""))).toBe(true);
});

test("access: a Quality Technician gets the access message and 403; signed out gets 401", async ({ browser, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3100", storageState: { cookies: [], origins: [] } });
  expect((await anon.get("/api/measurements/csv")).status()).toBe(401);
  await anon.dispose();
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await signInAs(p, "technician", "/signin");
  await expect(p).toHaveURL(/localhost:\d+\/$/);
  await p.goto("/dashboard/measurements");
  await expect(p.getByRole("heading", { name: "This page is for Quality Engineers" })).toBeVisible();
  expect((await ctx.request.get("/api/measurements/csv")).status()).toBe(403);
  await ctx.close();
});
