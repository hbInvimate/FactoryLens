// The Quality Technician's Tasks page: the landing page after sign-in, New Task, the filters, opening a
// task into its check, the status following the check, and own tasks only.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { signInAs, type Who } from "./auth-helpers";
import { doSteps, startCheck, unique, waitSaved } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

async function signedIn(browser: Browser, who: Who) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await signInAs(page, who, "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/tasks$/);
  return { ctx, page };
}

async function newTask(page: Page, title: string, part: string, priority: "High" | "Medium" | "Low") {
  await page.getByRole("button", { name: "+ New Session" }).click();
  const dialog = page.getByRole("dialog", { name: "New session" });
  await dialog.getByLabel("Session (optional)").fill(title);
  await dialog.getByLabel("Part", { exact: true }).fill(part);
  await dialog.getByLabel("Priority").selectOption({ label: priority });
  await dialog.getByRole("button", { name: "Create session" }).click();
  await expect(dialog).toHaveCount(0);
}

const row = (page: Page, title: string) => page.getByTestId("tasks-table").locator("tr", { hasText: title });

test("a Quality Technician lands on Tasks, adds a task, filters and searches", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician");
  await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
  await expect(page.getByText("View and manage all sessions")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute("aria-current", "page");
  const total = Number(await page.getByTestId("stat-total").innerText());
  const notStarted = Number(await page.getByTestId("stat-not-started").innerText());

  const title = unique("Bracket first-off");
  await newTask(page, title, "BRK-220", "High");
  const r = row(page, title);
  await expect(r).toContainText("BRK-220");
  await expect(r).toContainText("High");
  await expect(r).toContainText("Test Quality Technician");
  await expect(r).toContainText("First-off check");
  await expect(r.getByTestId("task-status")).toHaveText("Not started");
  await expect(page.getByTestId("stat-total")).toHaveText(String(total + 1));
  await expect(page.getByTestId("stat-not-started")).toHaveText(String(notStarted + 1));

  // Priority filter.
  await page.getByLabel("Priority").selectOption("low");
  await expect(page).toHaveURL(/priority=low/);
  await expect(row(page, title)).toHaveCount(0);
  await page.getByLabel("Priority").selectOption("high");
  await expect(row(page, title)).toHaveCount(1);

  // Status filter: Completed hides it; the default (active) shows it.
  await page.getByLabel("Status").selectOption("completed");
  await expect(page).toHaveURL(/status=completed/);
  await expect(row(page, title)).toHaveCount(0);
  await page.getByLabel("Status").selectOption("active");
  await expect(row(page, title)).toHaveCount(1);

  // Search.
  await page.getByLabel("Search session").fill("no such task anywhere");
  await page.getByLabel("Search session").press("Enter");
  await expect(page).toHaveURL(/q=no\+such/);
  await expect(page.getByText("No sessions match these filters.")).toBeVisible();
  await page.getByLabel("Search session").fill(title);
  await page.getByLabel("Search session").press("Enter");
  await expect(page.getByTestId("tasks-table").locator("tbody tr")).toHaveCount(1);
  await ctx.close();
});

test("opening a task starts its check, with the step video and details; the status follows the check", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician");
  const title = unique("Clamp plate");
  const part = unique("CP");
  await newTask(page, title, part, "Medium");
  await row(page, title).getByRole("button", { name: `Start ${title}` }).click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  const id = page.url().split("/check/")[1];

  // The task page: the SOP check, plus the step's video and details.
  await expect(page.getByText(part, { exact: true })).toBeVisible();
  await expect(page.getByTestId("step-video")).toContainText("Video: not recorded yet");
  await expect(page.getByTestId("step-details")).toContainText("What to do");
  await expect(page.getByTestId("step-details")).toContainText("What correct looks like");
  await expect(page.getByTestId("step-target")).toHaveText(/^(\d+:\d{2}|\[set by plant\])$/);
  await doSteps(page, 1, 1);
  await waitSaved(page);

  // In progress, and Open goes back to the same check.
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(row(page, title).getByTestId("task-status")).toHaveText("In progress");
  await row(page, title).getByRole("link", { name: `Open ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));

  // Finished: Completed, out of the active list, with a Review link.
  await doSteps(page, 2, 12);
  await expect(page.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await waitSaved(page);
  await page.goto("/tasks");
  await expect(row(page, title)).toHaveCount(0);
  await page.getByLabel("Status").selectOption("completed");
  await expect(row(page, title).getByTestId("task-status")).toHaveText("Completed");
  await expect(row(page, title).getByRole("link", { name: "Review" })).toHaveAttribute("href", `/sessions/${id}`);
  await ctx.close();
});

test("a Quality Technician sees only their own tasks and cannot start another's; a Quality Engineer gets the access message", async ({ browser }) => {
  const a = await signedIn(browser, "technician");
  const title = unique("Mine only");
  await newTask(a.page, title, "MO-1", "Low");
  const taskId = await row(a.page, title).getAttribute("data-task");

  const b = await signedIn(browser, "technician2");
  await b.page.getByLabel("Search session").fill(title);
  await b.page.getByLabel("Search session").press("Enter");
  await expect(b.page.getByText(/No sessions (yet|match)/)).toBeVisible();
  const res = await b.ctx.request.post(`/api/tasks/${taskId}/start`, { data: { sessionId: crypto.randomUUID() } });
  expect(res.status()).toBe(403);
  const list = await (await b.ctx.request.get("/api/tasks")).json();
  expect(list.tasks.some((t: { id: string }) => t.id === taskId)).toBe(false);

  const eng = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const ep = await eng.newPage();
  await signInAs(ep, "engineer", "/dashboard/signin");
  await expect(ep).toHaveURL(/\/dashboard$/);
  await ep.goto("/tasks");
  await expect(ep.getByTestId("wrong-area")).toHaveText("This page is for Quality Technicians");
  expect((await eng.request.get("/api/tasks")).status()).toBe(403);
  await Promise.all([a.ctx.close(), b.ctx.close(), eng.close()]);
});

test("a check started on Start a check is listed too: Resume while in progress, View when finished", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician2");
  const before = Number(await page.getByTestId("stat-total").innerText());
  const id = await startCheck(page);
  await doSteps(page, 1, 1);
  await waitSaved(page);

  await page.goto("/tasks");
  const r = page.getByTestId("tasks-table").locator(`tr[data-session="${id}"]`);
  await expect(r.getByTestId("task-status")).toHaveText("In progress");
  await expect(r).toContainText("—"); // no priority
  await expect(page.getByTestId("stat-total")).toHaveText(String(before + 1));
  await page.getByLabel("Priority").selectOption("high");
  await expect(r).toHaveCount(0);
  await page.goto("/tasks");
  await r.getByRole("link", { name: /^Resume / }).click();
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));

  await doSteps(page, 2, 12);
  await expect(page.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await waitSaved(page);
  await page.goto("/tasks?status=completed");
  await expect(r.getByTestId("task-status")).toHaveText("Completed");
  await expect(r.getByRole("link", { name: /^View / })).toHaveAttribute("href", `/sessions/${id}`);
  await ctx.close();
});
