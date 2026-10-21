// Update SOP: a failed Confirm (the answer is lost after the server saved), then Retry, activates exactly one
// revision. Runs last (playwright.config.ts): it changes the Active revision.
import { expect, test } from "@playwright/test";
import { REV_A_ID } from "../lib/sop-revisions";
import { signInAs } from "./auth-helpers";
import { BASELINE_WHO, candidateDataset, timedActions, type TimedSpec } from "./sopFixtures";

test.describe.configure({ mode: "serial" });

let fastCheck = "";
let fastStation = "";

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
  await expect(tp).toHaveURL(/localhost:\d+\/tasks$/);
  const fastId = await save(tctx.request, data.find((x) => x.key === "A5")!.spec);
  fastCheck = fastId;
  fastStation = station;
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
  await expect(changes.first()).toHaveAttribute("data-step", "7"); // the biggest gain first
  await expect(page.getByTestId("update-changes").locator('li[data-step="7"]')).toContainText('New note for "What to do": Check the odd-numbered holes first');
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
  await expect(page.getByTestId("update-done")).toContainText("SOP updated to rev");
  await expect(page.getByTestId("what-changed")).toContainText("Check target: 45:00 →");

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

test("Discard draft: kept as Discarded, audited, and never blocks Use this way", async ({ page, request }) => {
  const propose = () => request.post("/api/sop/update/propose", { data: { sessionId: fastCheck } });
  // An open draft (a manual CT decision) blocks Use this way...
  const decided = await request.post("/api/sop/decisions", {
    data: { step: 7, newCtSeconds: 170, confirmed: true, reason: "Discard test", evidenceSessionIds: [fastCheck], overrideReason: "Only one check" },
  });
  expect(decided.ok(), await decided.text()).toBeTruthy();
  const draft = await decided.json();
  const blocked = await propose();
  expect(blocked.status()).toBe(400);
  expect((await blocked.json()).error).toContain("still open in SOP history");

  // ...until it is discarded from SOP history.
  await page.goto("/dashboard/sop");
  const row = page.getByTestId("revisions").locator(`li[data-revision="${draft.label}"]`);
  await row.getByRole("button", { name: "Discard draft" }).click();
  await row.getByRole("button", { name: `Discard draft ${draft.label}` }).click();
  await expect(row).toHaveAttribute("data-status", "discarded");
  await expect(row).toContainText("Discarded");

  const next = await propose();
  expect(next.ok(), await next.text()).toBeTruthy();
  const proposal = await next.json();
  expect(proposal.revisionId).toBeTruthy();

  // Discard draft on the review page too.
  await page.goto(`/dashboard/sop/review/${encodeURIComponent(proposal.revisionId)}`);
  await page.getByRole("button", { name: "Discard draft" }).click();
  await page.getByRole("button", { name: `Discard draft ${proposal.label}` }).click();
  await page.waitForURL(/\/dashboard\/sop$/);
  await expect(page.getByTestId("revisions").locator(`li[data-revision="${proposal.label}"]`)).toHaveAttribute("data-status", "discarded");

  const { revisions, audit } = await (await request.get("/api/sop/revisions")).json();
  expect(revisions.filter((r: { status: string }) => r.status === "active").map((r: { id: string }) => r.id)).toEqual([REV_A_ID]); // nothing activated
  for (const id of [draft.revisionId, proposal.revisionId]) {
    const entry = audit.find((a: { action: string; revisionId: string }) => a.action === "discarded" && a.revisionId === id);
    expect(entry).toMatchObject({ actorName: "Test Admin" });
    expect(entry.at).toBeTruthy();
  }
  // A discarded draft never runs and never blocks.
  const again = await propose();
  expect(again.ok(), await again.text()).toBeTruthy();
  await request.post(`/api/sop/update/${(await again.json()).revisionId}/discard`);
});

test("Discard, back to Update SOP: no pop-up, and Use this way starts fresh", async ({ page }) => {
  // Arrive by clicks (client navigation), as a Quality Engineer would: the list page stays mounted while hidden.
  await page.goto(`/dashboard/update-sop?station=${encodeURIComponent(fastStation)}`);
  const row = () => page.getByTestId("last-sessions-table").locator(`tr[data-session="${fastCheck}"]`);
  await row().getByRole("button", { name: "Use this way" }).click();
  await page.waitForURL(/\/dashboard\/update-sop\/[^/?]+$/);
  const first = page.url();
  await expect(page.getByRole("heading", { name: "Check what the platform found" })).toBeVisible();

  // Discard goes straight back to the list of the check's station.
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/dashboard/update-sop" && u.searchParams.get("station") === fastStation);
  await expect(page.getByTestId("update-discarded")).toBeHidden(); // not the old "Discarded" page

  // The list, in its normal state: no "The platform is working" pop-up.
  await expect(page.getByRole("heading", { name: "Update SOP", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Finding what would change…")).toBeHidden();
  await expect(row().getByRole("button", { name: "Use this way" })).toBeEnabled();

  // Use this way again: a fresh run and a new proposal.
  await row().getByRole("button", { name: "Use this way" }).click();
  await page.waitForURL((u) => /\/dashboard\/update-sop\/[^/?]+$/.test(u.pathname) && u.href !== first);
  await expect(page.getByRole("heading", { name: "Check what the platform found" })).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click(); // leave nothing open
  await page.waitForURL((u) => u.pathname === "/dashboard/update-sop");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
