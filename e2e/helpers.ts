import { expect, type Page } from "@playwright/test";
import { STEPS } from "../lib/sop";

export async function startCheck(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Start the check" }).click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  await expect(page.locator("li[aria-current=step]")).toBeVisible();
  return page.url().split("/check/")[1];
}

export function grid(page: Page, step: number, which: "main" | "your view" = "main") {
  return page.getByRole("group", { name: which === "main" ? `Step ${step} points` : `Step ${step} points, your view`, exact: true });
}

export async function tap(page: Page, step: number, points: string[], which: "main" | "your view" = "main") {
  const g = grid(page, step, which);
  for (const p of points) await g.getByRole("button", { name: p, exact: true }).click();
}

async function expectAt(page: Page, n: number) {
  await expect(page.locator("li[aria-current=step]")).toContainText(STEPS[n - 1].name);
}

/** Steps 7 to 10 need a value for every point, in order (the value confirms the point). */
export const MEASURED = [7, 8, 9, 10];

/** Records a value for each point, in order, with the Record value panel. */
export async function recordValues(page: Page, n: number, points: string[], value = "10") {
  const entry = page.locator("li[aria-current=step]").getByTestId("measure-entry");
  for (const p of points) {
    await expect(entry.getByLabel(`Step ${n} point to record`)).toHaveValue(p);
    await entry.getByLabel(`Value for ${p} in mm`).fill(value);
    await entry.getByRole("button", { name: "Record value" }).click();
    await expect(entry.locator(`li[data-point="${p}"]`)).toBeVisible();
  }
}

/** Does step n correctly: confirms every point in order (with a value at steps 7 to 10), then moves on. */
export async function doStep(page: Page, n: number) {
  await expectAt(page, n);
  const s = STEPS[n - 1];
  if (MEASURED.includes(n)) await recordValues(page, n, s.points);
  else if (s.points.length) await tap(page, n, s.points);
  const label = s.points.length ? (n === 12 ? "Finish the check" : "Next step") : n === 12 ? "Done, finish the check" : "Done, next step";
  await page.getByRole("button", { name: label, exact: true }).click();
}

export async function doSteps(page: Page, from: number, to: number) {
  for (let n = from; n <= to; n++) await doStep(page, n);
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId("connection")).toHaveText("Connected", { timeout: 15_000 });
}

/** Records the hold decision on the hold screen or in the hold dialog. */
export async function decideHold(page: Page, outcome: string, by: string, reason: string) {
  await page.getByRole("button", { name: outcome, exact: true }).click();
  await page.getByRole("button", { name: by, exact: true }).click();
  await page.getByLabel("Reason (their words, required)").fill(reason);
  await page.getByRole("button", { name: "Record the decision and close the hold" }).last().click();
}

/** Starts a check at a station, adding the station first if it is not in the list. */
export async function startAt(page: Page, station: string): Promise<string> {
  await page.goto("/");
  const select = page.getByLabel("Cell and fixture", { exact: true });
  const known = await select.locator("option", { hasText: station }).count();
  if (known) {
    await select.selectOption(station);
  } else {
    await select.selectOption("__add__");
    await page.getByLabel("New station: cell and fixture").fill(station);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(select).toHaveValue(station);
  }
  await page.getByRole("button", { name: "Start the check" }).click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  await expect(page.locator("li[aria-current=step]")).toBeVisible();
  return page.url().split("/check/")[1];
}

export async function openDashboard(page: Page, station: string) {
  await page.goto(`/dashboard?station=${encodeURIComponent(station)}&range=all`);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByLabel("Station")).toHaveValue(station);
}

export const unique = (label: string) => `${label} ${Math.random().toString(36).slice(2, 7)}`;

export async function lodge(page: Page, stepName: RegExp | string, issue: string) {
  await page.getByRole("button", { name: "Lodge a discrepancy" }).first().click();
  await expect(page.getByRole("heading", { name: "Lodge a discrepancy" })).toBeVisible();
  await page.getByRole("button", { name: stepName }).first().click();
  await page.getByRole("button", { name: new RegExp(issue.replace(/[()]/g, "\\$&")) }).click();
}
