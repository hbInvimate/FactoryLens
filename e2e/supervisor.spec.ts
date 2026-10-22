// Supervisor mode: the sign-in mode cards, the four Supervisor pages, and Watch opening a session read-only.
import { expect, test } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { doSteps, startCheck, waitSaved } from "./helpers";

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
  for (const k of ["kpi-ongoing", "kpi-today", "kpi-ftr", "kpi-hold"]) await expect(page.getByTestId(k)).toBeVisible();
  await expect(page.getByTestId("ongoing").locator(`tr[data-session="${id}"]`)).toBeVisible();

  // Watch: the session page, without Resume.
  await page.getByTestId("ongoing").locator(`tr[data-session="${id}"]`).getByRole("link", { name: /^Watch/ }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
  await expect(page.getByRole("link", { name: "Resume this check" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← All checks" })).toBeVisible();

  // The KPI card opens Tasks; the check is there with Watch.
  await page.goto("/supervisor");
  await page.getByTestId("kpi-ongoing").click();
  await expect(page).toHaveURL(/\/supervisor\/tasks\?status=in_progress$/);
  await expect(page.getByTestId("supervisor-tasks").locator(`tr[data-session="${id}"]`).getByRole("link", { name: /^Watch/ })).toHaveAttribute("href", `/sessions/${id}`);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="member-"]', { hasText: "Test Quality Technician" }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByTestId("ftr-weeks")).toBeVisible();
  await expect(page.getByTestId("step-times")).toBeVisible();

  // Read-only: the check app is not theirs.
  await page.goto("/");
  await expect(page.getByTestId("wrong-area")).toHaveText("This page is for Quality Technicians");
  await ctx.close();
  await tctx.close();
});
