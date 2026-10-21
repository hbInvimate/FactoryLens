// "Make this the primary way": activating the Draft that sop-review.spec.ts built (step 5 edited to 00:37,
// step 7 accepted with the order note, step 9 rejected), a running check keeping revision A, the banner,
// rollback, the revision chip and the audit log. Runs last (playwright.config.ts): it changes the Active revision.
import { expect, test, type Browser } from "@playwright/test";
import { STEPS } from "../lib/sop";
import { REV_A_ID } from "../lib/sop-revisions";
import { signInAs } from "./auth-helpers";
import { doSteps, startCheck, waitSaved } from "./helpers";

test.describe.configure({ mode: "serial" });

const ODD = "Check the odd-numbered holes first";
let draftId = "";
let draftLabel = "";
let runningId = "";
let newId = "";

async function signedIn(browser: Browser, who: "technician" | "technician2") {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await signInAs(page, who, "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/tasks$/);
  return { ctx, page };
}

test("make the draft the primary way: the confirm box lists only the accepted changes; a reason is required", async ({ page, request, browser }) => {
  // A check that is already running on revision A.
  const t1 = await signedIn(browser, "technician");
  runningId = await startCheck(t1.page);
  await doSteps(t1.page, 1, 1);
  await waitSaved(t1.page);
  expect((await (await t1.ctx.request.get(`/api/sessions/${runningId}`)).json()).meta.sopRevisionId).toBe(REV_A_ID);
  await t1.ctx.close();

  const { revisions } = await (await request.get("/api/sop/revisions")).json();
  const draft = revisions.find((r: { status: string }) => r.status === "draft");
  draftId = draft.id;
  draftLabel = draft.label;

  await page.goto(`/dashboard/sop/review/${encodeURIComponent(draftId)}`);
  await page.getByRole("button", { name: "Make this the primary way" }).click();
  const box = page.getByRole("dialog");
  const list = box.getByTestId("primary-changes");
  await expect(list.locator("li")).toHaveCount(2); // 5 and 7; the rejected step 9 is not there
  await expect(list.locator('li[data-step="5"]')).toContainText("CT 02:00 → 00:37");
  await expect(list.locator('li[data-step="7"]')).toContainText("CT 14:00 → 02:40");
  await expect(list.locator('li[data-step="7"]')).toContainText(ODD);
  const confirm = box.getByRole("button", { name: "Confirm and make primary" });
  await expect(confirm).toBeDisabled();
  await box.getByLabel("Reason (required)").fill("Odd-first hole order is faster and correct first time. Agreed with the shift.");
  await confirm.click();
  await page.waitForURL(/\/dashboard\/sop$/);
  await expect(page.getByTestId("active-revision")).toContainText(`Rev ${draftLabel} · Active`);
  await expect(page.getByTestId("revisions").locator('li[data-revision="A"]')).toHaveAttribute("data-status", "retired");
});

test("a running check keeps revision A; new checks use the new revision and show it", async ({ browser }) => {
  // The running check: still revision A, and its step 7 text has no new note.
  const t1 = await signedIn(browser, "technician");
  await t1.page.goto(`/check/${runningId}`);
  await expect(t1.page.locator("li[aria-current=step]")).toBeVisible();
  expect((await (await t1.ctx.request.get(`/api/sessions/${runningId}`)).json()).meta.sopRevisionId).toBe(REV_A_ID);
  await t1.page.getByRole("button", { name: STEPS[6].name }).click();
  await expect(t1.page.getByText(STEPS[6].todo, { exact: true })).toBeVisible();
  await expect(t1.page.getByText(ODD)).toHaveCount(0);
  await t1.ctx.close();

  // A new check by another Quality Technician: the new revision.
  const t2 = await signedIn(browser, "technician2");
  await expect(t2.page.getByText(`SOP: First-off check, rev ${draftLabel}, 12 steps.`)).toBeVisible();
  newId = await startCheck(t2.page);
  await doSteps(t2.page, 1, 1);
  await waitSaved(t2.page);
  const journal = await (await t2.ctx.request.get(`/api/sessions/${newId}`)).json();
  expect(journal.meta.sopRevisionId).toBe(draftId);
  expect(journal.meta.sop).toBe(`First-off check, rev ${draftLabel}`);
  await t2.page.getByRole("button", { name: STEPS[6].name }).click();
  await expect(t2.page.getByText(ODD)).toBeVisible();
  await t2.ctx.close();
});

test("the one-time banner and I have read this", async ({ browser }) => {
  const t1 = await signedIn(browser, "technician");
  const banner = t1.page.getByTestId("sop-banner");
  await expect(banner).toContainText(`SOP rev ${draftLabel} is active.`);
  await expect(banner).toContainText("Step 5 changed: target CT 00:37. Step 7 changed: target CT 02:40, What to do.");
  await banner.getByRole("button", { name: "I have read this" }).click();
  await expect(banner).toHaveCount(0);
  await t1.page.reload();
  await expect(t1.page.getByText(`SOP: First-off check, rev ${draftLabel}`, { exact: false })).toBeVisible();
  await expect(t1.page.getByTestId("sop-banner")).toHaveCount(0); // once only
  await t1.ctx.close();
});

test("the dashboard shows a revision chip on sessions", async ({ page }) => {
  await page.goto(`/dashboard?station=${encodeURIComponent("Laser cell 3 · FX-014")}&range=all&shift=all&sample=0`);
  await expect(page.locator(`tr[data-session="${newId}"]`).getByTestId("row-revision")).toHaveText(`Rev ${draftLabel}`);
  await expect(page.locator(`tr[data-session="${runningId}"]`).getByTestId("row-revision")).toHaveText("Rev A");
});

test("roll back to revision A with a reason; every action is in the audit log", async ({ page, request, browser }) => {
  await page.goto("/dashboard/sop");
  const a = page.getByTestId("revisions").locator('li[data-revision="A"]');
  await a.getByRole("button", { name: "Make this revision active again" }).click();
  const go = a.getByRole("button", { name: "Make revision A active" });
  await expect(go).toBeDisabled();
  await a.getByLabel("Reason to make revision A active again").fill("Trial ended. Back to the baseline until the gauge study is done.");
  await go.click();
  await expect(page.getByTestId("active-revision")).toContainText("Rev A · Active");
  await expect(page.getByTestId("revisions").locator(`li[data-revision="${draftLabel}"]`)).toHaveAttribute("data-status", "retired");

  // New checks use A again, and Quality Technicians see the banner for it once.
  const t2 = await signedIn(browser, "technician2");
  await expect(t2.page.getByText("SOP: First-off check, rev A, 12 steps.")).toBeVisible();
  await expect(t2.page.getByTestId("sop-banner")).toContainText("SOP rev A is active.");
  await t2.ctx.close();

  const { audit, revisions } = await (await request.get("/api/sop/revisions")).json();
  expect(revisions.find((r: { label: string }) => r.label === "A").status).toBe("active");
  const actions = audit.map((x: { action: string; revisionId: string }) => `${x.action}:${x.revisionId}`);
  expect(actions).toEqual(expect.arrayContaining([`activated:${draftId}`, `rolled_back:${REV_A_ID}`, `acknowledged:${draftId}`]));
  const act = audit.find((x: { action: string }) => x.action === "activated");
  expect(act).toMatchObject({ reason: "Odd-first hole order is faster and correct first time. Agreed with the shift.", actorName: "Test Admin" });
  expect(act.detail).toMatchObject({ from: REV_A_ID, fromLabel: "A", label: draftLabel });
  expect(audit.find((x: { action: string }) => x.action === "rolled_back").reason).toContain("Trial ended.");
});

test("making a revision active needs a reason and the right status; a Quality Technician gets 403", async ({ request, browser }) => {
  expect((await request.post(`/api/sop/revisions/${draftId}/activate`, { data: { kind: "rollback", reason: "" } })).status()).toBe(400);
  const primaryAgain = await request.post(`/api/sop/revisions/${draftId}/activate`, { data: { kind: "primary", reason: "again" } });
  expect(primaryAgain.status()).toBe(400); // no longer a draft
  const t1 = await signedIn(browser, "technician");
  expect((await t1.ctx.request.post(`/api/sop/revisions/${draftId}/activate`, { data: { kind: "rollback", reason: "x" } })).status()).toBe(403);
  await t1.ctx.close();
});
