// Scenario 7: things going wrong in the app itself.
import { expect, test } from "@playwright/test";
import { ADMIN_STATE } from "./auth-helpers";
import { doSteps, grid, startCheck, tap, waitSaved } from "./helpers";

test("Refresh mid-session resumes where she left off", async ({ page }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 6);
  await tap(page, 7, ["H1", "H2", "H3"]);
  await page.reload();

  await expect(page.locator("li[aria-current=step]")).toContainText("Check holes H1 to H14");
  const g = grid(page, 7);
  for (const h of ["H1", "H2", "H3"]) await expect(g.getByRole("button", { name: h, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(g.getByRole("button", { name: "H4", exact: true })).toHaveAttribute("aria-pressed", "false");

  // The start page offers to resume it too.
  await waitSaved(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Resume the check" }).click();
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));
  await expect(page.locator("li[aria-current=step]")).toContainText("Check holes H1 to H14");
});

test("A new device resumes the session from the server", async ({ page, browser }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 3);
  await waitSaved(page);
  // Another device, signed in as the same person.
  const other = await browser.newPage({ storageState: ADMIN_STATE });
  await other.goto(`/check/${id}`);
  await expect(other.locator("li[aria-current=step]")).toContainText("Round pin, then slot pin, no force");
  await other.close();
});

test("Offline: banner, keep working, saves are queued and sent on reconnect", async ({ page, context, request }) => {
  const id = await startCheck(page);
  await doSteps(page, 1, 1);
  await waitSaved(page);

  await context.setOffline(true);
  await doSteps(page, 2, 4);
  await expect(page.getByTestId("offline-banner")).toContainText("No connection. Keep working.");
  await expect(page.getByTestId("offline-banner")).toContainText("saves are queued");
  await expect(page.getByTestId("connection")).toHaveText("Offline");

  // Nothing reached the server yet.
  let journal = await (await request.get(`/api/sessions/${id}`)).json();
  expect(journal.actions.filter((a: { type: string }) => a.type === "next_step")).toHaveLength(1);

  await context.setOffline(false);
  await waitSaved(page);
  await expect(page.getByTestId("offline-banner")).toHaveCount(0);
  journal = await (await request.get(`/api/sessions/${id}`)).json();
  expect(journal.actions.filter((a: { type: string }) => a.type === "next_step")).toHaveLength(4);
});

test("Save fails: error with Retry, nothing is lost", async ({ page, request }) => {
  const id = await startCheck(page);
  await waitSaved(page);
  await page.route("**/api/sessions/*/actions", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Database unavailable." }) }),
  );
  await doSteps(page, 1, 2);
  await expect(page.getByTestId("save-error")).toContainText("Could not save: Database unavailable.");
  await page.unroute("**/api/sessions/*/actions");
  await page.getByRole("button", { name: "Retry" }).click();
  await waitSaved(page);
  const journal = await (await request.get(`/api/sessions/${id}`)).json();
  expect(journal.actions.filter((a: { type: string }) => a.type === "next_step")).toHaveLength(2);
});

test("Mistaken tap: Undo within 10 seconds", async ({ page }) => {
  await startCheck(page);
  await doSteps(page, 1, 6);
  await tap(page, 7, ["H1", "H2"]);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(grid(page, 7).getByRole("button", { name: "H2", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(grid(page, 7).getByRole("button", { name: "H1", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Undo a step that was marked done by mistake.
  await tap(page, 7, ["H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14"]);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText("Check slots and notches");
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText("Check holes H1 to H14");
});

test("Pause and Resume; Leave asks for a reason and keeps the session", async ({ page }) => {
  await startCheck(page);
  await doSteps(page, 1, 2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toHaveCount(0);

  await page.getByRole("button", { name: "Leave", exact: true }).click();
  const leave = page.getByRole("button", { name: "Leave the check" });
  await expect(leave).toBeDisabled();
  await page.getByRole("button", { name: "End of shift" }).click();
  await leave.click();
  await page.waitForURL(/\/$/);
  await page.getByRole("link", { name: "Resume the check" }).click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toContainText("End of shift");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator("li[aria-current=step]")).toContainText("Lower the part onto pads P1 to P3");
});

async function statusOf(request: import("@playwright/test").APIRequestContext, id: string) {
  const { sessions } = await (await request.get("/api/sessions")).json();
  return (sessions as { id: string; status: string }[]).find((s) => s.id === id)?.status;
}

test("After a completed check, a new check starts at once and nothing shows as in progress", async ({ page, request }) => {
  const first = await startCheck(page);
  await doSteps(page, 1, 12);
  await expect(page.getByRole("heading", { name: "Check complete" })).toBeVisible();
  await waitSaved(page);

  // Back to the start page by the in-app link (the start page was visited before).
  await page.getByRole("link", { name: "Start a new check" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByText("A check is in progress on this device")).toHaveCount(0);
  const start = page.getByRole("button", { name: "Start the check" });
  await expect(start).toBeEnabled();
  await start.click();
  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/, { timeout: 5_000 });
  const second = page.url().split("/check/")[1];
  expect(second).not.toBe(first);
  await expect(page.locator("li[aria-current=step]")).toContainText("Confirm part, fixture and SOP");
  expect(await statusOf(request, first)).toBe("complete");

  // Leave on a finished check must not turn it back into one in progress.
  await doSteps(page, 1, 12);
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await page.getByRole("button", { name: "End of shift" }).click();
  await page.getByRole("button", { name: "Leave the check" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByText("A check is in progress on this device")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start the check" })).toBeEnabled();
  await waitSavedFor(request, second, "complete");
});

async function waitSavedFor(request: import("@playwright/test").APIRequestContext, id: string, status: string) {
  await expect.poll(() => statusOf(request, id), { timeout: 15_000 }).toBe(status);
}

test("A check still running: resume it, or leave it with a reason and start a new one", async ({ page, request }) => {
  const old = await startCheck(page);
  await doSteps(page, 1, 2);
  await waitSaved(page);

  await page.goto("/");
  await expect(page.getByText("A check is in progress on this device")).toBeVisible();
  await expect(page.getByText("Step 3 of 12.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start the check" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Resume the check" })).toBeVisible();

  await page.getByRole("button", { name: "End this check" }).click();
  const confirm = page.getByRole("button", { name: "Leave it and start a new check" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("button", { name: "Wrong part or session" }).click();
  await confirm.click();

  await page.waitForURL(/\/check\/[A-Za-z0-9-]+$/, { timeout: 5_000 });
  expect(page.url()).not.toContain(old);
  await expect(page.locator("li[aria-current=step]")).toContainText("Confirm part, fixture and SOP");
  await waitSavedFor(request, old, "left");

  const journal = await (await request.get(`/api/sessions/${old}`)).json();
  expect(journal.actions.some((a: { type: string; end?: boolean; reason?: string }) => a.type === "leave" && a.end && a.reason === "Wrong part or session")).toBeTruthy();
  await page.goto(`/check/${old}`);
  await expect(page.getByRole("heading", { name: "This check was left, not finished" })).toBeVisible();
});

test("Touch targets are at least 56 px", async ({ page }) => {
  await startCheck(page);
  await doSteps(page, 1, 6);
  const sizes = await page.locator("main button, header button").evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
      const r = e.getBoundingClientRect();
      return { h: r.height, w: r.width, t: e.textContent };
    }),
  );
  const small = sizes.filter((s) => s.h < 56 || s.w < 56);
  expect(small).toEqual([]);
});
