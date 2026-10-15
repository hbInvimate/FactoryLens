// Sign-in: two sign-in pages, roles enforced on the server, generic errors, the rate limit, sign out.
import { expect, test } from "@playwright/test";
import { GENERIC_SIGN_IN_ERROR } from "../lib/auth/roles";
import { signInAs, testUser } from "./auth-helpers";

// These tests start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test("a Quality Technician signs in at /signin and starts a check", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin\?next=%2F$/);
  await expect(page.getByText("Quality Technician", { exact: true })).toBeVisible();
  await signInAs(page, "technician", "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.getByTestId("signed-in-user")).toContainText(testUser("technician").name);
  await page.getByRole("button", { name: "Start the check" }).click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/);
  await expect(page.locator("li[aria-current=step]")).toBeVisible();
});

test("a Quality Technician cannot open the dashboard", async ({ page, context }) => {
  await signInAs(page, "technician", "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "This page is for Quality Engineers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in as a Quality Engineer" })).toHaveAttribute("href", "/dashboard/signin");
  await expect(page.getByTestId("tile-sessions")).toHaveCount(0);
  // A session report is closed too.
  await page.goto("/dashboard/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "This page is for Quality Engineers" })).toBeVisible();
  // The technician's own APIs still work.
  expect((await context.request.get("/api/sessions")).status()).toBe(200);
});

test("a Quality Engineer signs in at /dashboard/signin and sees the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard\/signin\?next=%2Fdashboard$/);
  await expect(page.getByText("Quality Engineer", { exact: true })).toBeVisible();
  await signInAs(page, "engineer", "/dashboard/signin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByTestId("signed-in-user")).toContainText(testUser("engineer").name);
  await expect(page.getByTestId("signed-in-user")).toContainText("Quality Engineer");
});

test("a Quality Engineer cannot start a check, on the page or through the API", async ({ page, context }) => {
  await signInAs(page, "engineer", "/dashboard/signin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "This page is for Quality Technicians" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in as a Quality Technician" })).toHaveAttribute("href", "/signin");
  await expect(page.getByRole("button", { name: "Start the check" })).toHaveCount(0);
  await page.goto("/sessions");
  await expect(page.getByRole("heading", { name: "This page is for Quality Technicians" })).toBeVisible();
  const id = crypto.randomUUID();
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: "Laser cell 3 · FX-014", operator: "x", createdAt: Date.now() };
  expect((await context.request.post(`/api/sessions/${id}/actions`, { data: { meta, actions: [] } })).status()).toBe(403);
  expect((await context.request.get("/api/sessions")).status()).toBe(403);
});

test("each sign-in page accepts its own role and the admin only", async ({ page }) => {
  await signInAs(page, "admin", "/dashboard/signin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/dashboard\/signin$/);
  // A Quality Technician on the Quality Engineer page: the same message as a wrong password.
  await signInAs(page, "technician", "/dashboard/signin");
  await expect(page.getByTestId("signin-error")).toHaveText(GENERIC_SIGN_IN_ERROR);
  await expect(page).toHaveURL(/\/dashboard\/signin/);
});

test("a wrong password or an unknown email gives the same generic message", async ({ page }) => {
  await signInAs(page, "engineer", "/dashboard/signin", "not-the-password");
  await expect(page.getByTestId("signin-error")).toHaveText(GENERIC_SIGN_IN_ERROR);
  await page.getByLabel("Email").fill("nobody@test.local");
  await page.getByLabel("Password").fill("whatever-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("signin-error")).toHaveText(GENERIC_SIGN_IN_ERROR);
  // The email stays filled in; the password does not.
  await expect(page.getByLabel("Email")).toHaveValue("nobody@test.local");
  await expect(page.getByLabel("Password")).toHaveValue("");
});

test("the rate limit locks after 5 failed attempts, even with the right password", async ({ page }) => {
  for (let i = 1; i <= 5; i++) {
    await signInAs(page, "locked", "/signin", `wrong-password-${i}`);
    await expect(page.getByTestId("signin-error")).toHaveText(GENERIC_SIGN_IN_ERROR);
    await page.goto("/signin");
  }
  await signInAs(page, "locked", "/signin");
  await expect(page.getByTestId("signin-error")).toHaveText(/^Too many attempts\. Wait 15 minutes/);
  await expect(page).toHaveURL(/\/signin/);
});

test("anonymous API reads and writes get 401", async ({ request }) => {
  const id = crypto.randomUUID();
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: "Laser cell 3 · FX-014", operator: "x", createdAt: Date.now() };
  const write = await request.post(`/api/sessions/${id}/actions`, {
    data: { meta, actions: [{ id: `${id}-1`, seq: 1, at: Date.now(), type: "next_step", step: 1 }] },
  });
  expect(write.status()).toBe(401);
  expect((await request.get("/api/sessions")).status()).toBe(401);
  expect((await request.get(`/api/sessions/${id}`)).status()).toBe(401);
  expect((await request.get("/api/stations")).status()).toBe(401);
  expect((await request.post("/api/stations", { data: { name: "Laser cell 99 · FX-1" } })).status()).toBe(401);
});

test("sign out ends the session", async ({ page, context }) => {
  await signInAs(page, "technician", "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/signin\?next=%2Fsessions$/);
  expect((await context.request.get("/api/sessions")).status()).toBe(401);
});
