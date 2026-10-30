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

const row = (page: Page, title: string) => page.getByTestId("tasks-table").locator("[data-row]", { hasText: title });

test("a Quality Technician lands on Tasks, adds a task, filters and searches", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician");
  await expect(page.getByTestId("greeting")).toHaveText(/^Good (morning|afternoon|evening)$/);
  for (const k of ["hero-start", "stat-today", "stat-rft", "stat-cycle", "stat-streak", "assigned", "before-you-start", "sidebar-start"]) await expect(page.getByTestId(k)).toBeVisible();
  await expect(page.getByTestId("start-a-check")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute("aria-current", "page");

  // A Quality Technician cannot create a task: the API refuses one.
  const denied = await page.request.post("/api/tasks", { data: { part: "X", station: "Laser cell 3 · FX-014", priority: "low" } });
  expect(denied.status()).toBe(403);

  const title = unique("Bracket first-off");
  await newTask(browser, new URL(page.url()).origin, title, "BRK-220", "High");
  await page.reload();
  const r = row(page, title);
  // One big row per check: no table, no search or filters.
  await expect(page.getByTestId("tasks-table").locator("table")).toHaveCount(0);
  await expect(page.getByLabel("Search session")).toHaveCount(0);
  await expect(r).toContainText("Laser cell 3 · FX-014 · not started · assigned");
  await expect(r).toContainText("High");
  await expect(r.getByTestId("task-status")).toHaveText("Not started");
  await expect(r.getByRole("button", { name: `Start ${title}` })).toHaveText("▶ Start");
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

test("Start a check always starts a new check: the one open on this device is paused and stays listed as Paused", async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, "technician2");
  // A task for the same part and cell does not stop it: the duplicate rule is only for task creation.
  const part = unique("SAME");
  const title = unique("Same part");
  const taskId = await newTask(browser, new URL(page.url()).origin, title, part, "Medium", "technician2");
  await page.reload();
  await page.getByTestId("hero-start").getByLabel("Part").selectOption(part);
  await page.getByTestId("hero-start").getByLabel("Cell and fixture").selectOption("Laser cell 3 · FX-014");
  await page.getByTestId("start-a-check").click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  const first = page.url().split("/check/")[1];
  await doSteps(page, 1, 2);
  await waitSaved(page);

  // Start a check again from Sessions: no "in progress on this device" message, a new check.
  await page.goto("/tasks");
  await page.getByTestId("start-a-check").click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  const second = page.url().split("/check/")[1];
  expect(second).not.toBe(first);
  await waitSaved(page);
  await page.goto("/tasks");
  await expect(page.getByText("A check is in progress on this device")).toHaveCount(0);
  const paused = page.locator(`[data-row][data-session="${first}"]`);
  await expect(paused.getByTestId("task-status")).toHaveText("Paused");
  await expect(paused).toContainText("step 3: Lower the part onto pads P1 to P3 · paused");
  await expect(paused.getByRole("link", { name: /^Resume / })).toHaveText("▶ Resume");
  // The task is still Not started.
  await expect(page.locator(`[data-row][data-task="${taskId}"]`).getByTestId("task-status")).toHaveText("Not started");
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
  await expect(page.getByRole("banner").getByText(part, { exact: true })).toBeVisible();
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
  await expect(row(b.page, title)).toHaveCount(0);
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
  const r = page.getByTestId("tasks-table").locator(`[data-row][data-session="${id}"]`);
  // Leaving the check page pauses it (page closed), so it is In progress or Paused: both are active work.
  await expect(r.getByTestId("task-status")).toHaveText(/^(In progress|Paused)$/);
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
