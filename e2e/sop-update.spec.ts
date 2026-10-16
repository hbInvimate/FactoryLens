// Update SOP: a failed Confirm (the answer is lost after the server saved), then Retry, activates exactly one
// revision. Runs last (playwright.config.ts): it changes the Active revision.
import { expect, test } from "@playwright/test";
import { REV_A_ID } from "../lib/sop-revisions";
import { signInAs } from "./auth-helpers";
import { BASELINE_WHO, candidateDataset, timedActions, type TimedSpec } from "./sopFixtures";

test("a failed Confirm, then Retry, activates exactly one revision", async ({ page, request, browser }) => {
  const station = `Laser cell U · FX-${Math.random().toString(36).slice(2, 7)}`;
  const data = candidateDataset();
  const save = async (req: typeof request, spec: TimedSpec) => {
    const id = crypto.randomUUID();
    const { createdAt, actions } = timedActions(id, spec);
    const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: station, station, operator: "typed", createdAt };
    expect((await req.post(`/api/sessions/${id}/actions`, { data: { meta, actions }, headers: spec.sample ? { "x-fl-sample": "1" } : {} })).ok()).toBeTruthy();
    return id;
  };
  for (const d of data.filter((x) => BASELINE_WHO.includes(x.key[0]))) await save(request, d.spec);
  const sampleId = await save(request, data.find((x) => x.key === "S0")!.spec);
  // One fast check by a Quality Technician, done correctly the first time.
  const tctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const tp = await tctx.newPage();
  await signInAs(tp, "technician", "/signin");
  await expect(tp).toHaveURL(/localhost:\d+\/$/);
  const fastId = await save(tctx.request, data.find((x) => x.key === "A5")!.spec);
  await tctx.close();

  // The dashboard's Update SOP button, then the last sessions: real only.
  await page.goto(`/dashboard?station=${encodeURIComponent(station)}&range=all`);
  await page.getByTestId("update-sop-button").click();
  await page.waitForURL(/\/dashboard\/update-sop/);
  await page.reload(); // the dashboard stays mounted, hidden, after a client navigation
  const table = page.getByTestId("last-sessions-table");
  await expect(table.locator(`tr[data-session="${sampleId}"]`)).toHaveCount(0);
  await table.locator(`tr[data-session="${fastId}"]`).getByRole("button", { name: "Use this way" }).click();
  await page.waitForURL(/\/dashboard\/update-sop\/[^/?]+$/);
  const revisionId = decodeURIComponent(page.url().split("/update-sop/")[1]);

  await expect(page.getByTestId("not-changed-yet")).toContainText("Not changed yet.");
  const changes = page.getByTestId("update-changes").locator("li");
  await expect(changes).toHaveCount(3);
  await expect(changes.nth(1)).toContainText("Order note for \"What to do\": Check the odd-numbered holes first");
  expect((await (await request.get("/api/sop/revisions")).json()).revisions.find((r: { status: string }) => r.status === "active").id).toBe(REV_A_ID);

  // The first Confirm reaches the server, but the answer is lost.
  let first = true;
  await page.route("**/api/sop/update/*/confirm", async (route) => {
    if (!first) return route.continue();
    first = false;
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Confirm and update SOP" }).click();
  await expect(page.getByTestId("verify-error")).toContainText("Press Retry.");
  await expect(page.getByTestId("update-changes")).toBeVisible(); // the proposal stays on screen
  await page.getByTestId("verify-error").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("update-done")).toContainText("The SOP is now rev");

  // A third Confirm, straight to the API, changes nothing either.
  const again = await request.post(`/api/sop/update/${revisionId}/confirm`);
  expect(await again.json()).toMatchObject({ ok: true, already: true });

  const { revisions, audit } = await (await request.get("/api/sop/revisions")).json();
  const active = revisions.filter((r: { status: string }) => r.status === "active");
  expect(active).toHaveLength(1);
  expect(active[0].id).toBe(revisionId);
  expect(audit.filter((a: { action: string; revisionId: string }) => a.action === "activated" && a.revisionId === revisionId)).toHaveLength(1);
  expect(audit.filter((a: { action: string; revisionId: string }) => a.action === "update_confirmed" && a.revisionId === revisionId)).toHaveLength(1);

  // Back to revision A for anything after this.
  expect((await request.post(`/api/sop/revisions/${REV_A_ID}/activate`, { data: { kind: "rollback", reason: "End of the Update SOP test" } })).ok()).toBeTruthy();
});
