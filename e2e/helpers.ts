import { expect, type Browser, type Page } from "@playwright/test";
import { STEPS } from "../lib/sop";
import { ADMIN_STATE } from "./auth-helpers";

export const DEFAULT_STATION = "Laser cell 3 · FX-014";

/** users.id of each Quality Technician, by name (from the Supervisor Team page, read as the test admin). */
const technicianIds = new Map<string, string>();

/**
 * Starts a check the only way the app allows: Start on an assigned task in Sessions. The test admin assigns the
 * task to whoever is signed in on `page` (a Quality Technician), or to Test Quality Technician when the admin itself
 * is signed in (an admin may start anyone's task). Returns the new check's id.
 */
export async function startAt(page: Page, station: string): Promise<string> {
  const title = await assignTask(page, station);
  await page.goto(`/tasks?q=${encodeURIComponent(title)}`);
  await page.getByRole("button", { name: `Start ${title}` }).click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  await expect(page.locator("li[aria-current=step]")).toBeVisible();
  return page.url().split("/check/")[1];
}

/** The test admin assigns a new task (part "B-pillar outer" at `station`) to whoever is signed in on `page`. Returns its title. */
export async function assignTask(page: Page, station: string = DEFAULT_STATION): Promise<string> {
  await page.goto("/tasks");
  const card = page.getByTestId("signed-in-user");
  await expect(card).toBeVisible();
  const name = (await card.locator("span[title]").first().getAttribute("title")) as string;
  const isTechnician = (await card.innerText()).includes("Quality Technician");
  const title = `First-off check ${Math.random().toString(36).slice(2, 8)}`;
  const task = { title, part: "B-pillar outer", station, priority: "medium" as const, assignee: isTechnician ? name : "Test Quality Technician" };
  const origin = new URL(page.url()).origin;
  let res = await adminTask(page.context().browser()!, origin, task);
  // The same part and station still open for that person is refused: then a part of its own.
  if (res.status === 400) res = await adminTask(page.context().browser()!, origin, { ...task, part: `B-pillar outer ${title.slice(-6)}` });
  expect(res.status).toBe(201);
  return title;
}

/**
 * Creates a task as the test admin (POST /api/tasks), given to a Quality Technician by name. Tasks are created only by
 * a Supervisor, an admin or npm run task:create. Returns the HTTP status, and the id or the error.
 */
export async function adminTask(
  browser: Browser,
  origin: string,
  t: { title?: string; part: string; station?: string; priority: "high" | "medium" | "low"; assignee: string },
): Promise<{ status: number; id?: string; error?: string }> {
  const admin = await browser.newContext({ storageState: ADMIN_STATE, baseURL: origin });
  try {
    if (!technicianIds.has(t.assignee)) {
      const team = await admin.newPage();
      await team.goto("/supervisor/team?period=12w");
      const member = team.locator('[data-testid^="member-"]').filter({ has: team.getByText(t.assignee, { exact: true }) }).first();
      technicianIds.set(t.assignee, ((await member.getAttribute("data-testid")) as string).slice("member-".length));
      await team.close();
    }
    const res = await admin.request.post("/api/tasks", {
      data: { title: t.title, part: t.part, station: t.station ?? DEFAULT_STATION, priority: t.priority, assignedTo: technicianIds.get(t.assignee) },
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    return { status: res.status(), ...body };
  } finally {
    await admin.close();
  }
}

export function startCheck(page: Page): Promise<string> {
  return startAt(page, DEFAULT_STATION);
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
