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

/** Does step n correctly: confirms every point in order, then moves on. */
export async function doStep(page: Page, n: number) {
  await expectAt(page, n);
  const s = STEPS[n - 1];
  if (s.points.length) await tap(page, n, s.points);
  const label = s.points.length ? (n === 12 ? "Finish the check" : "Next step") : n === 12 ? "Done, finish the check" : "Done, next step";
  await page.getByRole("button", { name: label, exact: true }).click();
}

export async function doSteps(page: Page, from: number, to: number) {
  for (let n = from; n <= to; n++) await doStep(page, n);
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId("connection")).toHaveText("Connected", { timeout: 15_000 });
}

export async function lodge(page: Page, stepName: RegExp | string, issue: string) {
  await page.getByRole("button", { name: "Lodge a discrepancy" }).first().click();
  await expect(page.getByRole("heading", { name: "Lodge a discrepancy" })).toBeVisible();
  await page.getByRole("button", { name: stepName }).first().click();
  await page.getByRole("button", { name: new RegExp(issue.replace(/[()]/g, "\\$&")) }).click();
}
