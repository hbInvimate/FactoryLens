// Measurements, "All values in a line": one row per check, the latest value per point, all on one page.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { signInAs } from "./auth-helpers";

const STATION = `Laser cell W · FX-${Math.random().toString(36).slice(2, 7)}`;
const ids: string[] = [];
let corrected = "";
let demo = "";

/** A saved check with values: [point, value] pairs, in the order recorded. */
async function check(request: APIRequestContext, values: [string, number][], at: number, sample = false): Promise<string> {
  const id = crypto.randomUUID();
  const meta = { id, part: "p", sop: "First-off check, rev A", fixture: STATION, station: STATION, operator: "x", createdAt: at };
  const step = (p: string) => (p[0] === "H" ? 7 : p[0] === "S" || p[0] === "N" ? 8 : p[0] === "T" ? 9 : 10);
  const actions = values.map(([point, value], i) => ({
    id: `${id}-m${i}`, seq: i + 1, at: at + 1000 * (i + 1), type: "measure", step: step(point), point, value, unit: "mm", source: "typed", heard: String(value), confidence: null, status: "recorded",
  }));
  const res = await request.post(`/api/sessions/${id}/actions`, { data: { meta, actions }, headers: sample ? { "x-fl-sample": "1" } : {} });
  expect(res.ok(), await res.text()).toBeTruthy();
  return id;
}

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/stations", { data: { name: STATION } })).ok()).toBeTruthy();
  const t0 = Date.now() - 2 * 86_400_000;
  // H1 recorded 10, then corrected to 11; T5 3.2; nothing at F4.
  corrected = await check(request, [["H1", 10], ["T5", 3.2], ["H1", 11]], t0);
  // 55 more checks: more than one old page of 50.
  for (let i = 0; i < 55; i++) ids.push(await check(request, [["S2", 4 + i / 10]], t0 + (i + 1) * 60_000));
  demo = await check(request, [["F1", 1.5]], t0 - 60_000, true);
});

const url = (extra = "") => `/dashboard/measurements?station=${encodeURIComponent(STATION)}&range=all&shift=all${extra}`;

test("one row per check, all on one page, newest first; the latest value wins, a correction has a dot, missing shows –", async ({ page }) => {
  await page.goto(url());
  await expect(page.getByRole("link", { name: "All values in a line" })).toHaveAttribute("aria-current", "page"); // the default view
  await expect(page.getByTestId("check-count")).toHaveText("57 checks");
  const rows = page.getByTestId("wide-table").locator("tbody tr");
  await expect(rows).toHaveCount(57); // no paging
  await expect(rows.first()).toHaveAttribute("data-session", ids[54]); // newest first
  await expect(page.getByTestId("wide-table").locator("thead th")).toContainText(["Date", "Quality Technician", "Station", "Session", "Holes H1–H14 (mm)"]);
  await expect(page.getByTestId("wide-table").locator("thead tr").nth(1).locator("th")).toHaveCount(40);

  const row = page.locator(`tr[data-session="${corrected}"]`);
  const h1 = row.locator('td[data-point="H1"]');
  await expect(h1).toHaveText("11"); // the latest
  await expect(h1).toHaveAttribute("data-corrected", "1");
  await expect(h1.getByTestId("corrected-dot")).toBeVisible();
  await expect(h1).toHaveAttribute("title", "Corrected. Earlier: 10 mm");
  await expect(row.locator('td[data-point="T5"]')).toHaveText("3.2");
  await expect(row.locator('td[data-point="T5"]')).not.toHaveAttribute("data-corrected", "1");
  await expect(row.locator('td[data-point="F4"]')).toHaveText("–");
  await expect(page.locator(`tr[data-session="${demo}"] td[data-point="F1"]`)).toHaveText("1.5D");
  // No yellow note on the page any more.
  await expect(page.getByText("Recorded as spoken or typed.")).toHaveCount(0);

  // The List view is still there.
  await page.getByRole("link", { name: "List" }).click();
  await expect(page.getByTestId("measurements-table")).toBeVisible();
});

test("the CSV in the line view: one row per check, the latest values, the note on every row", async ({ request }) => {
  const csv = await (await request.get(`/api/measurements/csv?station=${encodeURIComponent(STATION)}&range=all&shift=all`)).text();
  const lines = csv.trim().split("\r\n");
  expect(lines).toHaveLength(58);
  const head = lines[0].split(",");
  expect(head.slice(0, 5)).toEqual(["started_at", "technician", "station", "session", "H1_mm"]);
  expect(head).toHaveLength(4 + 40 + 3);
  const row = lines.find((l) => l.includes(corrected))!.split(",");
  expect(row[head.indexOf("H1_mm")]).toBe("11");
  expect(row[head.indexOf("F4_mm")]).toBe("");
  expect(row[head.indexOf("corrected_points")]).toBe("H1");
  expect(lines.slice(1).every((l) => l.endsWith('"Voice-entered or typed, not a validated record"'))).toBe(true); // quoted: it has a comma
});

test("a Quality Technician gets 403 from the export and the access message on the page", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await signInAs(p, "technician", "/signin");
  await expect(p).toHaveURL(/localhost:\d+\/$/);
  expect((await ctx.request.get(`/api/measurements/csv?station=${encodeURIComponent(STATION)}`)).status()).toBe(403);
  await p.goto(url());
  await expect(p.getByRole("heading", { name: "This page is for Quality Engineers" })).toBeVisible();
  await ctx.close();
});
