// Supervisor mode: the sign-in mode cards, the four Supervisor pages, Watch opening a session read-only, and Analytics from real rows.
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { decideHold, doSteps, lodge, recordValues, startAt, startCheck, tap, unique, waitSaved } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("sign-in shows the 3 mode cards; the picked mode names the button", async ({ page }) => {
  await page.goto("/signin");
  for (const m of ["technician", "supervisor", "engineer"]) await expect(page.getByTestId(`mode-${m}`)).toBeVisible();
  await expect(page.getByRole("radio", { name: /Quality Technician/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Sign in as Quality Technician" })).toBeVisible();
  await page.getByTestId("mode-supervisor").click();
  await expect(page.getByRole("button", { name: "Sign in as Supervisor" })).toBeVisible();
  await expect(page.getByTestId("signin-ticks").locator("li")).toHaveCount(3);
});

test("a Supervisor watches a check read-only from Home, Tasks, Team and Analytics", async ({ browser }) => {
  // A Quality Technician's check in progress.
  const tctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const tp = await tctx.newPage();
  await signInAs(tp, "technician", "/signin");
  await expect(tp).toHaveURL(/\/tasks$/);
  await tp.goto("/");
  const id = await startCheck(tp);
  await doSteps(tp, 1, 2);
  await waitSaved(tp);

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto("/signin");
  await page.getByTestId("mode-supervisor").click();
  await signInAs(page, "supervisor", "/signin");
  await expect(page).toHaveURL(/\/supervisor$/);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  for (const k of ["kpi-ongoing", "kpi-completed", "kpi-ftr", "kpi-cycle", "kpi-hold", "ai-banner", "recent-completed"]) await expect(page.getByTestId(k)).toBeVisible();
  await expect(page.getByTestId("home-bars").locator("[data-step]")).toHaveCount(12);
  await expect(page.getByTestId("ongoing").locator(`tr[data-session="${id}"]`)).toBeVisible();

  // Watch: the live view. Read-only, refreshed every 5 seconds while the check runs.
  await page.getByTestId("ongoing").locator(`tr[data-session="${id}"]`).getByRole("link", { name: /^Watch/ }).click();
  await expect(page).toHaveURL(new RegExp(`/supervisor/live/${id}$`));
  await expect(page.getByRole("heading", { name: /^B-pillar outer.* · First-off check$/ })).toBeVisible();
  await expect(page.getByTestId("live-chip")).toHaveText("LIVE");
  await expect(page.getByTestId("live-sub")).toContainText("Test Quality Technician · Laser cell 3 · FX-014 · SOP rev A · started");
  await expect(page.getByTestId("stat-step")).toHaveText("3/12");
  await expect(page.getByTestId("stat-time")).toHaveText(/^\d+:\d\d \/ 45:00$/);
  await expect(page.getByTestId("stat-deviations")).toHaveText("0");
  await expect(page.getByTestId("live-steps").locator("li[data-state=done]")).toHaveCount(2);
  await expect(page.getByTestId("live-steps").locator("li[data-state=current]")).toHaveAttribute("data-step", "3");
  await expect(page.getByTestId("live-now")).toContainText("Now: Step 3 · Lower the part onto pads P1 to P3");
  await expect(page.getByTestId("live-values")).toContainText("Nothing to record at this step.");
  await expect(page.getByTestId("live-activity").locator("li").first()).toContainText("Step 2 done");
  await expect(page.getByTestId("live-activity").locator("li").last()).toContainText("Check started by Test Quality Technician");
  await expect(page.getByRole("link", { name: "Resume this check" })).toHaveCount(0);
  await page.getByTestId("flag-review").click();
  await expect(page.getByRole("status").filter({ hasText: "Coming soon" })).toBeVisible();

  // The technician records two values at step 7; the open page shows them without a reload.
  await doSteps(tp, 3, 6);
  await recordValues(tp, 7, ["H1", "H2"], "10.05");
  await waitSaved(tp);
  await expect(page.getByTestId("live-values-count")).toHaveText("2 of 14", { timeout: 15_000 });
  await expect(page.getByTestId("stat-step")).toHaveText("7/12");
  await expect(page.getByTestId("live-values").locator("li[data-point=H1]")).toHaveText("H1 · 10.05 mm");
  await expect(page.getByTestId("live-values").locator("li[data-point=H3]")).not.toHaveAttribute("data-recorded");
  await expect(page.getByRole("link", { name: "← Tasks" })).toBeVisible();

  // The KPI card opens Tasks; the check is there with Watch.
  await page.goto("/supervisor");
  await page.getByTestId("kpi-ongoing").click();
  await expect(page).toHaveURL(/\/supervisor\/tasks\?status=in_progress$/);
  await expect(page.getByTestId("supervisor-tasks").locator(`tr[data-session="${id}"]`).getByRole("link", { name: /^Watch/ })).toHaveAttribute("href", `/supervisor/live/${id}`);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await expect(page.getByTestId("page-sub").filter({ hasText: "Quality Technician" })).toHaveText(/^\d+ Quality Technicians? · This week$/);
  for (const k of ["total-ftr", "total-checks", "total-time", "total-coach"]) await expect(page.getByTestId(k)).toBeVisible();
  await expect(page.getByTestId("team-filters").getByLabel("Sort")).toHaveValue("ftr");
  const card = page.locator('[data-testid^="member-"]').filter({ has: page.getByText("Test Quality Technician", { exact: true }) }).first();
  await expect(card.getByTestId("checks")).toHaveText(/^[1-9]\d*$/);
  await expect(card.getByTestId("time-bar")).toBeVisible();
  // A card opens Tasks filtered to that person.
  await card.click();
  await expect(page).toHaveURL(/\/supervisor\/tasks\?status=all&who=/);
  await expect(page.getByTestId("supervisor-tasks").locator(`tr[data-session="${id}"]`)).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Analytics" }).click();
  for (const c of ["ftr-weeks", "step-times", "top-deviations", "station-discrepancies"]) await expect(page.getByTestId(c)).toBeVisible();
  const filters = page.getByTestId("analytics-filters");
  await expect(filters.getByLabel("Period")).toHaveValue("8");
  await expect(filters.getByLabel("Station")).toHaveValue("all");
  const csv = await page.request.get((await page.getByTestId("export-csv").getAttribute("href")) as string);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).split("\n")[0]).toBe("Chart,Item,Value,Target seconds,Checks,Station");

  // From Analytics to Tasks: a station shows only its checks; a deviation filter shows what it is filtering.
  await page.goto(`/supervisor/tasks?status=all&step=3&dev=skipped`);
  await expect(page.getByTestId("tasks-focus")).toContainText("Step 3 skipped");
  await expect(page.getByTestId("supervisor-tasks").locator(`tr[data-session="${id}"]`)).toHaveCount(0);
  await page.goto(`/supervisor/tasks?status=all&station=No such station`);
  await expect(page.getByTestId("tasks-focus")).toContainText("Station: No such station");
  await expect(page.getByTestId("supervisor-tasks").locator(`tr[data-session="${id}"]`)).toHaveCount(0);

  // Read-only: the check app is not theirs.
  await page.goto("/");
  await expect(page.getByTestId("wrong-area")).toHaveText("This page is for Quality Technicians");
  await ctx.close();
  await tctx.close();
});

/** Step 5: C4 before C3, then released and closed in order. */
async function wrongClampsThenFix(page: Page) {
  await tap(page, 5, ["C1", "C2", "C4"]);
  await page.getByRole("button", { name: "Release all clamps" }).click();
  await tap(page, 5, ["C1", "C2", "C3", "C4", "C5", "C6"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();
}

/** Step 11: V4 and V5 skipped, then looked over. */
async function skipVisualThenFix(page: Page) {
  await tap(page, 11, ["V1", "V2", "V3"]);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await tap(page, 11, ["V4", "V5"], "your view");
  await page.getByRole("button", { name: "Fixed, continue" }).click();
}

test("Analytics shows real deviations and discrepancies; each row opens Tasks filtered to it", async ({ browser }) => {
  // A Quality Technician's check at a new station: clamps in the wrong order, a burr lodged and cleared, V4 and V5 skipped.
  const tctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const tp = await tctx.newPage();
  await signInAs(tp, "technician2", "/signin");
  await expect(tp).toHaveURL(/\/tasks$/);
  const station = unique("Laser cell 8 · FX-SUP");
  const id = await startAt(tp, station);
  await doSteps(tp, 1, 4);
  await wrongClampsThenFix(tp);
  await doSteps(tp, 6, 6);
  await lodge(tp, /Check holes H1 to H14 with check pins/, "Burr, dross or slug in the hole");
  await tp.getByRole("button", { name: "Back to the check" }).click();
  await tp.getByTestId("hold-strip").getByRole("button", { name: "Open the hold" }).click();
  await tp.getByRole("button", { name: "Record the decision and close the hold" }).click();
  await decideHold(tp, "Cleared, the check continues", "Shift supervisor", "Burr removed");
  await expect(tp.getByTestId("hold-strip")).toHaveCount(0);
  await doSteps(tp, 7, 10);
  await skipVisualThenFix(tp);
  await doSteps(tp, 12, 12);
  await expect(tp.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await waitSaved(tp);
  await tctx.close();

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto("/signin");
  await page.getByTestId("mode-supervisor").click();
  await signInAs(page, "supervisor", "/signin");
  await expect(page).toHaveURL(/\/supervisor$/);
  await page.goto(`/supervisor/analytics?weeks=8&station=${encodeURIComponent(station)}`);
  await expect(page.getByTestId("analytics-filters").getByLabel("Station")).toHaveValue(station);
  await expect(page.getByRole("heading", { name: "Typical time per step (median)" })).toBeVisible();
  await expect(page.getByTestId("step-times").locator("[data-step]")).toHaveCount(12);

  const devs = page.getByTestId("deviation-rows");
  await expect(devs.locator("[data-row]")).toHaveCount(2);
  for (const [key, label] of [["5-wrong_order", "Step 5 wrong order"], ["11-skipped", "Step 11 skipped"]]) {
    await expect(devs.locator(`[data-row="${key}"]`)).toContainText(label);
    await expect(devs.locator(`[data-row="${key}"] b`)).toHaveText("1");
  }
  const stations = page.getByTestId("station-rows");
  await expect(stations.locator("[data-row]")).toHaveCount(1);
  await expect(stations.locator(`[data-row="${station}"] b`)).toHaveText("1");

  // A deviation row opens Tasks filtered to it, with this check in it.
  await devs.locator('[data-row="11-skipped"]').click();
  await expect(page).toHaveURL(/\/supervisor\/tasks\?status=all&step=11&dev=skipped$/);
  await expect(page.getByTestId("tasks-focus")).toContainText("Step 11 skipped");
  await expect(page.getByTestId("supervisor-tasks").locator(`tr[data-session="${id}"]`)).toBeVisible();

  // A station row too.
  await page.goBack();
  await page.getByTestId("station-rows").locator(`[data-row="${station}"]`).click();
  await expect(page.getByTestId("tasks-focus")).toContainText(`Station: ${station}`);
  await expect(page.getByTestId("supervisor-tasks").locator("tbody tr[data-session]")).toHaveCount(1);
  await expect(page.getByTestId("supervisor-tasks").locator(`tr[data-session="${id}"]`)).toBeVisible();
  await ctx.close();
});
