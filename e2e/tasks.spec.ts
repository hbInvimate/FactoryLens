// The Quality Technician's Tasks page: the landing page after sign-in, New Task, the filters, opening a
// task into its check, the status following the check, and own tasks only.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN_STATE, signInAs, testUser, type Who } from "./auth-helpers";
import { adminTask, doSteps, startCheck, unique, waitSaved } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

async function signedIn(browser: Browser, who: Who) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await signInAs(page, who, "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/tasks$/);
  return { ctx, page };
}

/** Technicians cannot create tasks: the test admin gives one to a Quality Technician through the API. Returns the task id. */
async function newTask(browser: Browser, origin: string, title: string, part: string, priority: "High" | "Medium" | "Low", who: Who = "technician"): Promise<string> {
  const res = await adminTask(browser, origin, { title, part, priority: priority.toLowerCase() as "high" | "medium" | "low", assignee: testUser(who).name });
  expect(res.status, res.error).toBe(201);
  return res.id as string;
}

const row = (page: Page, title: string) => page.getByTestId("tasks-table").locator("tr", { hasText: title });

test("a Quality Technician lands on Tasks, adds a task, filters and searches", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician");
  await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
  await expect(page.getByText("Checks assigned to you", { exact: true })).toBeVisible();
  await expect(page.getByTestId("stat-mine")).toHaveCount(0);
  await expect(page.getByTestId("tasks-table").locator("thead")).not.toContainText("Type");
  await expect(page.getByTestId("tasks-table").locator("thead")).not.toContainText("Submission");
  await expect(page.getByTestId("start-a-check")).toHaveAttribute("href", "/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute("aria-current", "page");
  const notStarted = Number(await page.getByTestId("stat-not-started").innerText());

  // A Quality Technician cannot create a task: the API refuses one.
  const denied = await page.request.post("/api/tasks", { data: { part: "X", station: "Laser cell 3 · FX-014", priority: "low" } });
  expect(denied.status()).toBe(403);

  const title = unique("Bracket first-off");
  await newTask(browser, new URL(page.url()).origin, title, "BRK-220", "High");
  await page.reload();
  const r = row(page, title);
  await expect(r).toContainText("BRK-220");
  await expect(r).toContainText("High");
  await expect(r).toContainText("Test Quality Technician");
  await expect(r.getByTestId("task-status")).toHaveText("Not started");
  // Other tests add sessions for this technician at the same time: at least one more.
  await expect.poll(async () => Number(await page.getByTestId("stat-not-started").innerText())).toBeGreaterThanOrEqual(notStarted + 1);
  await expect(page.getByTestId("stat-completed")).toHaveCount(0);
  // Only work still to do can be picked.
  await expect(page.getByLabel("Status").locator("option")).toHaveText(["All active", "Not started", "In progress", "Paused"]);

  // Priority filter.
  await page.getByLabel("Priority").selectOption("low");
  await expect(page).toHaveURL(/priority=low/);
  await expect(row(page, title)).toHaveCount(0);
  await page.getByLabel("Priority").selectOption("high");
  await expect(row(page, title)).toHaveCount(1);

  // Status filter: In progress hides it; Not started and the default (All active) show it.
  await page.getByLabel("Status").selectOption("in_progress");
  await expect(page).toHaveURL(/status=in_progress/);
  await expect(row(page, title)).toHaveCount(0);
  await page.getByLabel("Status").selectOption("not_started");
  await expect(row(page, title)).toHaveCount(1);
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

test("a second task for the same part, cell and technician is refused while the first is not finished", async ({ browser }) => {
  const part = unique("DUP");
  await newTask(browser, test.info().project.use.baseURL as string, unique("First"), part, "Medium");
  const ctx = await browser.newContext({ storageState: ADMIN_STATE });
  const tech = await ctx.request.get("/api/tasks");
  const assignedTo = ((await tech.json()) as { tasks: { part: string; assignedTo: string }[] }).tasks.find((x) => x.part === part)!.assignedTo;
  const again = await ctx.request.post("/api/tasks", { data: { part: ` ${part.toLowerCase()} `, station: "Laser cell 3 · FX-014", priority: "high", assignedTo } });
  expect(again.status()).toBe(400);
  expect((await again.json()).error).toBe("This check is already assigned and not started");
  // Another cell is a different check.
  const other = await ctx.request.post("/api/tasks", { data: { part, station: "Laser cell 9 · FX-099", priority: "high", assignedTo } });
  expect(other.status()).toBe(201);
  await ctx.close();
});

test("Start a check from Sessions; a task with the same part and cell, not started yet, is started instead of a new check", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician2");
  const part = unique("SAME");
  const title = unique("Same part");
  const taskId = await newTask(browser, new URL(page.url()).origin, title, part, "Medium", "technician2");
  await page.reload();
  await page.getByTestId("start-a-check").click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.getByLabel("Part", { exact: true }).fill(part);
  await page.getByRole("button", { name: "Start the check" }).click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  const id = page.url().split("/check/")[1];
  await waitSaved(page);
  // The assigned task now has this check: no second row for the same part and cell.
  await page.goto(`/tasks?q=${encodeURIComponent(part)}`);
  await expect(page.getByTestId("tasks-table").locator("tbody tr[data-status]")).toHaveCount(1);
  await expect(page.locator(`tr[data-task="${taskId}"]`)).toHaveAttribute("data-session", id);
  await ctx.close();
});

test("opening a task starts its check, with the step video and details; the status follows the check", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician");
  const title = unique("Clamp plate");
  const part = unique("CP");
  await newTask(browser, new URL(page.url()).origin, title, part, "Medium");
  await page.reload();
  await row(page, title).getByRole("button", { name: `Start ${title}` }).click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  const id = page.url().split("/check/")[1];

  // The task page: the SOP check, plus the step's video and details.
  await expect(page.getByText(part, { exact: true })).toBeVisible();
  await expect(page.getByTestId("step-video")).toHaveText("SOP video: Not recorded yet");
  await expect(page.getByTestId("step-details")).toContainText("What to do");
  await expect(page.getByTestId("step-details")).toContainText("What correct looks like");
  await expect(page.getByTestId("step-target")).toHaveText(/^(\d+:\d{2}|\[set by plant\])$/);
  await doSteps(page, 1, 1);
  await waitSaved(page);

  // In progress, and Open goes back to the same check.
  await page.goto("/tasks");
  await expect(row(page, title).getByTestId("task-status")).toHaveText("In progress");
  await row(page, title).getByRole("link", { name: `Resume ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));

  // Finished: out of Sessions, even asked for by URL; it is in Past sessions.
  await doSteps(page, 2, 12);
  await expect(page.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await waitSaved(page);
  await page.goto("/tasks");
  await expect(row(page, title)).toHaveCount(0);
  await page.goto("/tasks?status=completed");
  await expect(row(page, title)).toHaveCount(0);
  await page.goto("/sessions");
  await expect(page.locator(`tr[data-session="${id}"]`)).toBeVisible();
  await ctx.close();
});

test("a Quality Technician sees only their own tasks and cannot start another's; a Quality Engineer gets the access message", async ({ browser }) => {
  const a = await signedIn(browser, "technician");
  const title = unique("Mine only");
  const taskId = await newTask(browser, new URL(a.page.url()).origin, title, unique("MO"), "Low");
  await a.page.reload();
  await expect(row(a.page, title)).toHaveCount(1);

  const b = await signedIn(browser, "technician2");
  await b.page.getByLabel("Search session").fill(title);
  await b.page.getByLabel("Search session").press("Enter");
  await expect(b.page.getByText(/No sessions match these filters|No checks assigned to you/)).toBeVisible();
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

test("a started check stays listed with Resume while in progress, and moves to Past sessions when finished", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician2");
  const id = await startCheck(page);
  await doSteps(page, 1, 1);
  await waitSaved(page);

  await page.goto("/tasks");
  const r = page.getByTestId("tasks-table").locator(`tr[data-session="${id}"]`);
  await expect(r.getByTestId("task-status")).toHaveText("In progress");
  // Leaving the check page pauses it (page closed), so it is In progress or Paused: both are active work.
  await page.getByLabel("Priority").selectOption("high");
  await expect(r).toHaveCount(0);
  await page.goto("/tasks");
  await r.getByRole("link", { name: /^Resume / }).click();
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));

  await doSteps(page, 2, 12);
  await expect(page.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await waitSaved(page);
  // Finished: not in Sessions any more; in Past sessions.
  await page.goto("/tasks");
  await expect(r).toHaveCount(0);
  await page.goto("/sessions");
  await expect(page.locator(`tr[data-session="${id}"]`)).toBeVisible();
  await ctx.close();
});

test("the sidebar is on every Quality Technician page; in a check it opens from the menu and leaves through Leave", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician2");
  for (const [path, label] of [["/tasks", "Sessions"], ["/sessions", "Past sessions"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
  // The sidebar is Sessions and Past sessions only.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(2);

  const id = await startCheck(page);
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeHidden(); // hidden while the check runs
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(menu).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(menu).toBeHidden();

  // Leaving through the menu asks first, like Leave; Stay keeps the check.
  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("button", { name: "Past sessions" }).click();
  await expect(page.getByRole("dialog", { name: "Leave this check?" })).toBeVisible();
  await page.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));

  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("button", { name: "Past sessions" }).click();
  const leave = page.getByRole("dialog", { name: "Leave this check?" });
  await leave.getByRole("button", { name: "Break" }).click();
  await leave.getByRole("button", { name: "Leave the check" }).click();
  await expect(page).toHaveURL(/\/sessions$/);

  // The top bar's Sessions button asks too.
  await page.goto(`/check/${id}`);
  await page.getByRole("dialog", { name: "Paused" }).getByRole("button", { name: "Resume" }).click(); // left: paused
  await page.getByRole("banner").getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Leave this check?" })).toBeVisible();
  await page.getByRole("button", { name: "Break" }).click();
  await page.getByRole("button", { name: "Leave the check" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await ctx.close();
});

test("below 1024 px the sidebar is behind the menu button", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician2");
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto("/tasks");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByTestId("signed-in-user")).toBeVisible();
  await menu.getByRole("link", { name: "Past sessions" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  await ctx.close();
});
