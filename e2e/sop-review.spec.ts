// One-click flow, part 2: ONE CLICK, SUGGEST, REVIEW. Runs after sop-analysis (playwright.config.ts):
// both change the one open Draft on the test server.
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { checkRows, findCandidates } from "../lib/sop-candidates";
import { CODE_REVISION } from "../lib/sop-revisions";
import { compare, describeOrder, roundUp } from "../lib/sop-suggest";
import { STEPS } from "../lib/sop";
import { signInAs, testUser } from "./auth-helpers";
import { BASELINE_WHO, FAST_STEPS, ODD_FIRST, candidateDataset, statSession, timedActions, type TimedSpec } from "./sopFixtures";

test.describe.configure({ mode: "serial" });

const data = candidateDataset();
const sessions = data.map(({ key, spec }) => statSession(key, spec));
const NO_TARGETS = Array<number | null>(12).fill(null);
const ODD_NOTE = "Check the odd-numbered holes first (H1, H3 … H13), then the even ones (H2, H4 … H14).";

/** The station's checks, and a candidate built from six of A's checks with some changed. */
function scenario(change?: (i: number, spec: TimedSpec) => TimedSpec) {
  const all = data.map(({ key, spec }) => statSession(key, key.startsWith("A") && change ? change(Number(key.slice(1)), spec) : spec));
  const station = checkRows(all);
  const candidate = station.filter((r) => r.id.startsWith("A"));
  return { station, candidate };
}

test.describe("the comparison (no browser)", () => {
  test("A's checks: TIME on steps 5, 7 and 9, ORDER on step 7, a realistic-check warning on 9, no change elsewhere", () => {
    const cand = findCandidates(sessions, NO_TARGETS).candidates[0];
    expect(cand.label).toBe("QT-A");
    const r = compare(cand.checks, checkRows(sessions), CODE_REVISION.steps);
    expect(r.changes.map((c) => `${c.step}:${c.type}`)).toEqual(["5:time", "7:time", "7:order", "9:time"]);
    expect(r.noChange).toEqual([1, 2, 3, 4, 6, 8, 10, 11, 12]);
    const [s5, s7, o7, s9] = r.changes;
    expect(s5).toMatchObject({ oldValue: "120", newValue: "35", warning: null }); // old value: the placeholder target
    expect(s5.why).toBe("6 of 6 checks were faster than the station median 00:40 by at least 5% and 3 s. Their median 00:35, rounded up to 00:35.");
    expect(s7).toMatchObject({ newValue: "160", warning: null }); // 158 rounded up
    expect(o7.oldValue).toBe(STEPS[6].todo);
    expect(o7.newValue).toBe(`${STEPS[6].todo} ${ODD_NOTE}`);
    expect(o7.why).toContain("6 of 6 checks confirmed the points (Holes H1 to H14) in another order");
    expect(s9).toMatchObject({ newValue: "150", warning: "New CT is faster than 90% of the checks at this station. Check it is realistic." });
    expect(s9.detail).toMatchObject({ stationChecks: 64, stationSlowerPercent: 91, checks: 6, fasterChecks: 6 });
    expect(s5.sourceSessionIds.sort()).toEqual(["A0", "A1", "A2", "A3", "A4", "A5"]);
    // A clip reference per step from the latest check.
    expect(r.clips).toHaveLength(12);
    expect(r.clips[0]).toMatchObject({ sessionId: "A5", step: 1, startSecond: 0, endSecond: 10 });
    expect(r.clips[6]).toMatchObject({ step: 7, endSecond: r.clips[6].startSecond + 158 });
  });

  test("the 80% rule: faster in 4 of 6 checks is no suggestion, 5 of 6 is", () => {
    const four = scenario((i, s) => (i < 2 ? { ...s, steps: { ...FAST_STEPS, 5: 40 } } : s));
    expect(compare(four.candidate, four.station, CODE_REVISION.steps).changes.some((c) => c.step === 5)).toBe(false);
    const five = scenario((i, s) => (i < 1 ? { ...s, steps: { ...FAST_STEPS, 5: 40 } } : s));
    expect(compare(five.candidate, five.station, CODE_REVISION.steps).changes.find((c) => c.step === 5)?.why).toMatch(/^5 of 6 checks/);
    // ORDER: the odd-first order in only 4 of 6 checks is no suggestion.
    const order4 = scenario((i, s) => (i < 2 ? { ...s, order: {} } : s));
    expect(compare(order4.candidate, order4.station, CODE_REVISION.steps).changes.some((c) => c.type === "order")).toBe(false);
    const order5 = scenario((i, s) => (i < 1 ? { ...s, order: {} } : s));
    expect(compare(order5.candidate, order5.station, CODE_REVISION.steps).changes.some((c) => c.type === "order")).toBe(true);
  });

  test("only steps correct on the first attempt count", () => {
    // Step 7 skipped (then fixed) in 2 of A's 6 checks: 4 of 6 left, under 80%, so no step 7 changes.
    const r = scenario((i, s) => (i < 2 ? { ...s, skip7: true } : s));
    const changes = compare(r.candidate, r.station, CODE_REVISION.steps).changes;
    expect(changes.some((c) => c.step === 7)).toBe(false);
    expect(changes.some((c) => c.step === 5)).toBe(true);
  });

  test("rounding up to the next 5 seconds; targets (placeholders today) are not the reference", () => {
    expect([roundUp(158), roundUp(150), roundUp(151), roundUp(1)]).toEqual([160, 150, 155, 5]);
    const cand = findCandidates(sessions, NO_TARGETS).candidates[0];
    const targets = CODE_REVISION.steps.map((s, i) => ({ ...s, targetCtSeconds: i === 4 ? 37 : null }));
    // A 00:37 target is ignored: step 5 is still judged against the station median 00:40, and the old value is the target.
    expect(compare(cand.checks, checkRows(sessions), targets).changes.find((c) => c.step === 5)).toMatchObject({ newValue: "35", oldValue: "37" });
    expect(describeOrder(STEPS[6].points, ODD_FIRST)).toBe(ODD_NOTE);
    expect(describeOrder(STEPS[6].points, [...STEPS[6].points].reverse())).toBe("Check the holes in reverse order, H14 down to H1.");
  });
});

// ---------- on the test server ----------

const STATION = `Laser cell R · FX-${Math.random().toString(36).slice(2, 7)}`;
let revisionId = "";

async function save(req: APIRequestContext, specs: TimedSpec[]) {
  for (const spec of specs) {
    const id = crypto.randomUUID();
    const { createdAt, actions } = timedActions(id, spec);
    const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: STATION, station: STATION, operator: "typed", createdAt };
    const res = await req.post(`/api/sessions/${id}/actions`, { data: { meta, actions }, headers: spec.sample ? { "x-fl-sample": "1" } : {} });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

async function signedIn(browser: Browser, who: "technician" | "technician2") {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await signInAs(p, who, "/signin");
  await expect(p).toHaveURL(/localhost:\d+\/tasks$/);
  return ctx;
}

const by = (prefix: string) => data.filter((d) => d.key.startsWith(prefix)).map((d) => d.spec);
const getRevision = async (request: APIRequestContext) => (await (await request.get(`/api/sop/revisions/${revisionId}`)).json());

test("one click builds the draft and shows the suggestions like c2", async ({ page, request, browser }) => {
  await save(request, BASELINE_WHO.flatMap((w) => by(w)));
  const t1 = await signedIn(browser, "technician");
  await save(t1.request, by("A"));
  const t2 = await signedIn(browser, "technician2");
  await save(t2.request, by("B"));
  await save(request, by("E")); // E: faster but not correct first time; counts in the station's 64 checks
  await save(request, by("S"));
  await t1.close();
  await t2.close();

  await page.goto(`/dashboard/sop?station=${encodeURIComponent(STATION)}&range=all&shift=all&sample=0`);
  const row = page.getByTestId("candidates-table").locator(`tr[data-candidate="${testUser("technician").name}"]`);
  await row.getByRole("button", { name: "Review this way" }).click();
  await page.waitForURL(/\/dashboard\/sop\/review\/[^/]+$/);
  revisionId = decodeURIComponent(page.url().split("/review/")[1]);
  await page.reload(); // the overview stays mounted, hidden, after a client navigation

  await expect(page.getByTestId("review-title")).toHaveText(`Suggested changes from 6 checks by ${testUser("technician").name}`);
  await expect(page.getByTestId("video-placeholder")).toHaveText("▶ Video placeholder: not recorded yet");
  const strip = page.getByTestId("step-strip");
  await expect(strip.locator('button[data-marked="1"]')).toHaveText(["5", "7", "9"]);
  const table = page.getByTestId("suggestions-table");
  const rows = table.locator("tr[data-suggestion]");
  await expect(rows).toHaveCount(4);
  await expect(table.locator('tr[data-step="7"][data-type="order"]')).toContainText(ODD_NOTE);
  await expect(table.locator('tr[data-step="9"]').getByTestId("suggestion-warning")).toContainText("Check it is realistic.");
  await expect(table.locator('tr[data-step="7"][data-type="time"]')).toContainText("14:00 → 02:40");
  await expect(page.getByTestId("no-change-row")).toContainText("1–4, 6, 8, 10–12");
  await expect(rows.locator('[data-testid="suggestion-status"]')).toHaveText(["Proposed", "Proposed", "Proposed", "Proposed"]);
  // Clicking a step in the strip selects its row.
  await strip.getByRole("button", { name: "9" }).click();
  await expect(strip.getByRole("button", { name: "9" })).toHaveAttribute("aria-pressed", "true");

  // Stored: the suggestions, the why, and a clip reference per step. Nothing applied yet.
  const rev = await getRevision(request);
  expect(rev.revision.status).toBe("draft");
  expect(rev.revision.sourceLabel).toBe(testUser("technician").name);
  expect(rev.suggestions.map((s: { step: number; type: string }) => `${s.step}:${s.type}`).sort()).toEqual(["5:time", "7:order", "7:time", "9:time"]);
  expect(rev.suggestions.every((s: { why: string; sourceSessionIds: string[] }) => s.why && s.sourceSessionIds.length >= 5)).toBe(true);
  expect(rev.clips).toHaveLength(12);
  expect(rev.steps[8].targetCtSeconds).toBe(540); // revision A's placeholder
  expect(rev.steps[6].todo).toBe(STEPS[6].todo);

  // A second click opens the same review rather than building another.
  await page.goto(`/dashboard/sop?station=${encodeURIComponent(STATION)}&range=all&shift=all&sample=0`);
  await page.getByTestId("candidates-table").locator(`tr[data-candidate="${testUser("technician").name}"]`).getByRole("button", { name: "Review this way" }).click();
  await page.waitForURL(new RegExp(`/dashboard/sop/review/${revisionId}$`));
});

test("reject step 9, edit step 5, accept step 7: the draft holds only those, and every action is audited", async ({ page, request }) => {
  await page.goto(`/dashboard/sop/review/${encodeURIComponent(revisionId)}`);
  const table = page.getByTestId("suggestions-table");
  const before = await getRevision(request);

  // Reject step 9: nothing changes.
  await table.locator('tr[data-step="9"]').getByRole("button", { name: "Reject" }).click();
  await expect(table.locator('tr[data-step="9"]')).toHaveAttribute("data-status", "rejected");
  expect((await getRevision(request)).steps[8].targetCtSeconds).toBe(before.steps[8].targetCtSeconds);

  // Edit step 5 to 00:37.
  const r5 = table.locator('tr[data-step="5"]');
  await r5.getByRole("button", { name: "Edit" }).click();
  await r5.getByLabel("New CT for step 5 (mm:ss)").fill("00:37");
  await r5.getByRole("button", { name: "Save the edit" }).click();
  await expect(r5).toHaveAttribute("data-status", "edited");
  await expect(r5).toContainText("02:00 → 00:37");

  // Accept both step 7 suggestions.
  await table.locator('tr[data-step="7"][data-type="time"]').getByRole("button", { name: "Accept" }).click();
  await expect(table.locator('tr[data-step="7"][data-type="time"]')).toHaveAttribute("data-status", "accepted");
  await table.locator('tr[data-step="7"][data-type="order"]').getByRole("button", { name: "Accept" }).click();
  await expect(table.locator('tr[data-step="7"][data-type="order"]')).toHaveAttribute("data-status", "accepted");
  await expect(table.locator('tr[data-step="7"][data-type="order"]').getByTestId("suggestion-status")).toHaveText(/Accepted by Test Admin/);

  const after = await getRevision(request);
  expect(after.steps[4].targetCtSeconds).toBe(37);
  expect(after.steps[6].targetCtSeconds).toBe(160);
  expect(after.steps[6].todo).toBe(`${STEPS[6].todo} ${ODD_NOTE}`);
  expect(after.steps[8].targetCtSeconds).toBe(before.steps[8].targetCtSeconds); // rejected: unchanged
  const s5 = after.suggestions.find((s: { step: number }) => s.step === 5);
  expect(s5).toMatchObject({ status: "edited", proposedValue: "35", newValue: "37", decidedBy: "Test Admin" });
  // The check points never change.
  expect(after.steps).toHaveLength(12);

  // A bad edit is refused and changes nothing.
  const bad = await request.post(`/api/sop/suggestions/${s5.id}`, { data: { action: "edit", value: "soon" } });
  expect(bad.status()).toBe(400);
  expect((await getRevision(request)).steps[4].targetCtSeconds).toBe(37);

  // Accepting, then rejecting, puts the Active value back.
  const s9 = after.suggestions.find((s: { step: number }) => s.step === 9);
  expect((await request.post(`/api/sop/suggestions/${s9.id}`, { data: { action: "accept" } })).ok()).toBeTruthy();
  expect((await getRevision(request)).steps[8].targetCtSeconds).toBe(150);
  expect((await request.post(`/api/sop/suggestions/${s9.id}`, { data: { action: "reject" } })).ok()).toBeTruthy();
  expect((await getRevision(request)).steps[8].targetCtSeconds).toBe(540); // back to the Active value

  const { audit } = await (await request.get("/api/sop/revisions")).json();
  const mine = audit.filter((a: { revisionId: string }) => a.revisionId === revisionId);
  const actions = mine.map((a: { action: string; step: number | null }) => `${a.action}:${a.step ?? ""}`);
  expect(actions).toEqual(expect.arrayContaining(["review_started:", "suggestion_rejected:9", "suggestion_edited:5", "suggestion_accepted:7", "suggestion_accepted:9"]));
  expect(actions.filter((a: string) => a === "suggestion_accepted:7")).toHaveLength(2);
  expect(mine.every((a: { actorName: string }) => a.actorName === "Test Admin")).toBe(true);
  expect(mine.find((a: { action: string }) => a.action === "suggestion_edited").detail).toMatchObject({ proposed: "35", to: "37" });
});

test("access: a Quality Technician gets the access message and 403; signed out gets 401", async ({ browser, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3100", storageState: { cookies: [], origins: [] } });
  expect((await anon.post("/api/sop/reviews", { data: {} })).status()).toBe(401);
  expect((await anon.post(`/api/sop/suggestions/x`, { data: { action: "accept" } })).status()).toBe(401);
  expect((await anon.get(`/api/sop/revisions/${revisionId}`)).status()).toBe(401);
  await anon.dispose();

  const tech = await signedIn(browser, "technician");
  const tp = await tech.newPage();
  await tp.goto(`/dashboard/sop/review/${encodeURIComponent(revisionId)}`);
  await expect(tp.getByRole("heading", { name: "This page is for Quality Engineers" })).toBeVisible();
  expect((await tech.request.post("/api/sop/reviews", { data: { station: STATION, candidate: "x" } })).status()).toBe(403);
  expect((await tech.request.post(`/api/sop/suggestions/x`, { data: { action: "accept" } })).status()).toBe(403);
  expect((await tech.request.get(`/api/sop/revisions/${revisionId}`)).status()).toBe(403);
  await tech.close();
});
