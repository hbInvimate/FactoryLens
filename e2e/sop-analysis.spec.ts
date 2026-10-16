// SOP management, stage 2: the analysis and the CT decision.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { getRepo } from "../lib/server/repo";
import { completedSessions } from "../lib/server/sopData";
import { percentile, stepAnalysis, stepStats } from "../lib/sop-stats";
import { signInAs } from "./auth-helpers";
import { DATASET, statSession, timedActions } from "./sopFixtures";

test.describe.configure({ mode: "serial" });

const all = Object.entries(DATASET).map(([id, s]) => statSession(id, s));
const real = all.filter((s) => !s.isSample);

test.describe("the maths, on a fixed dataset with known answers (no browser)", () => {
  test("percentile interpolates like Postgres percentile_cont", () => {
    expect(percentile([100, 120, 130, 160, 180, 200], 0.5)).toBe(145);
    expect(percentile([100, 120, 130, 160, 180, 200], 0.25)).toBe(122.5);
    expect(percentile([7], 0.25)).toBe(7);
    expect(percentile([], 0.5)).toBeNull();
  });

  test("step 7, real sessions only: median, fastest quarter, first-time correct, by shift; pauses not counted", () => {
    const s7 = stepStats(real)[6];
    expect(s7).toEqual({
      step: 7,
      sessions: 6,
      medianSeconds: 145, // (130 + 160) / 2; the 60 s pause in r3 is not counted
      fastestQuarterSeconds: 123, // 120 + 0.25 × 10 = 122.5, rounded
      firstTimeCorrect: 83, // 5 of 6: r6 skipped H9 to H12 first
      byShift: [
        { shift: "A", sessions: 3, medianSeconds: 120 }, // 100, 120, 180
        { shift: "B", sessions: 2, medianSeconds: 145 }, // 130, 160
        { shift: "C", sessions: 1, medianSeconds: 200 },
      ],
    });
    // Every other step takes 10 s in every session.
    expect(stepStats(real)[0]).toMatchObject({ medianSeconds: 10, fastestQuarterSeconds: 10, firstTimeCorrect: 100, sessions: 6 });
  });

  test("evidence: correct first time only, fastest first, with step and check time", () => {
    const { evidence } = stepAnalysis(real, 7);
    expect(evidence.map((e) => e.id)).toEqual(["r1", "r2", "r3", "r4", "r5"]); // r6 was not correct first time
    expect(evidence.map((e) => e.stepSeconds)).toEqual([100, 120, 130, 160, 200]);
    expect(evidence.find((e) => e.id === "r3")).toMatchObject({ shift: "B", checkSeconds: 11 * 10 + 130 });
    expect(evidence.map((e) => e.shift)).toEqual(["A", "A", "B", "B", "C"]);
  });

  test("with sample data on, the sample session joins the numbers and is marked as sample", () => {
    const s7 = stepStats(all)[6];
    expect(s7).toMatchObject({ sessions: 7, medianSeconds: 130, fastestQuarterSeconds: 110 });
    const { evidence } = stepAnalysis(all, 7);
    expect(evidence[0]).toMatchObject({ id: "s1", stepSeconds: 50, isSample: true });
  });

  test("the database view leaves sample sessions out unless asked", async () => {
    process.env.FL_STORAGE = "memory";
    const repo = getRepo();
    const station = `Laser cell S · FX-${Math.random().toString(36).slice(2, 7)}`;
    for (const [id, s] of Object.entries(DATASET)) {
      const { createdAt, actions } = timedActions(`${station}-${id}`.replace(/[^A-Za-z0-9-]/g, ""), s);
      const sid = `${station}-${id}`.replace(/[^A-Za-z0-9-]/g, "");
      await repo.save({ id: sid, part: "p", sop: "First-off check, rev A", fixture: station, station, operator: "QT-test", createdAt }, actions, { sample: s.sample });
    }
    const f = { station, since: null, shift: null, includeSample: false };
    const realOnly = await completedSessions(f);
    expect(realOnly).toHaveLength(6);
    expect(realOnly.some((s) => s.isSample)).toBe(false);
    expect(stepStats(realOnly)[6]).toMatchObject({ medianSeconds: 145, fastestQuarterSeconds: 123, firstTimeCorrect: 83 });
    const withSample = await completedSessions({ ...f, includeSample: true });
    expect(withSample).toHaveLength(7);
    expect(stepStats(withSample)[6].medianSeconds).toBe(130);
  });
});

// ---------- on the test server ----------

const STATION = `Laser cell D · FX-${Math.random().toString(36).slice(2, 7)}`;
const ids: Record<string, string> = {};

async function postDataset(request: APIRequestContext) {
  for (const [key, s] of Object.entries(DATASET)) {
    const id = crypto.randomUUID();
    const { createdAt, actions } = timedActions(id, s);
    const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: STATION, station: STATION, operator: "QT-test", createdAt };
    const res = await request.post(`/api/sessions/${id}/actions`, { data: { meta, actions }, headers: s.sample ? { "x-fl-sample": "1" } : {} });
    expect(res.ok(), await res.text()).toBeTruthy();
    ids[key] = id;
  }
}

const decide = (request: APIRequestContext, body: Record<string, unknown>) =>
  request.post("/api/sop/decisions", { data: { step: 7, newCtSeconds: 160, confirmed: true, ...body } });

test("the CT decision: required fields, real evidence only, the minimum and its recorded override, audit entries", async ({ request }) => {
  await postDataset(request);
  const tag = `run-${Date.now().toString(36)}`;

  // Required: a reason, and the person's own confirmation.
  expect((await decide(request, { reason: "", evidenceSessionIds: [ids.r1] })).status()).toBe(400);
  const unconfirmed = await decide(request, { reason: `x ${tag}`, confirmed: false, evidenceSessionIds: [ids.r1] });
  expect(unconfirmed.status()).toBe(400);
  expect((await unconfirmed.json()).error).toContain("I decided this CT. FactoryLens AI did not.");

  // A sample session can never be evidence.
  const sample = await decide(request, { reason: `x ${tag}`, evidenceSessionIds: [ids.r1, ids.s1], overrideReason: "trying" });
  expect(sample.status()).toBe(400);
  expect((await sample.json()).error).toBe("Sample sessions cannot be used as evidence.");

  // Nor a session where the step was not correct on the first attempt.
  expect((await decide(request, { reason: `x ${tag}`, evidenceSessionIds: [ids.r6], overrideReason: "trying" })).status()).toBe(400);

  // Below the minimum (3 sessions) without an override: refused.
  const below = await decide(request, { reason: `below ${tag}`, evidenceSessionIds: [ids.r1, ids.r2, ids.r3] });
  expect(below.status()).toBe(400);
  expect((await below.json()).error).toContain("below the minimum: 5 sessions from 2 shifts");

  // With an override reason: saved in a Draft, and the override is recorded.
  const over = await decide(request, { reason: `override ${tag}`, evidenceSessionIds: [ids.r1, ids.r2, ids.r3], overrideReason: `only three ${tag}` });
  expect(over.ok(), await over.text()).toBeTruthy();
  const o = await over.json();
  expect(o.evidence).toEqual({ sessions: 3, shifts: 2, met: false });
  expect(o.label).toMatch(/^[B-Z]/);

  // The minimum met: 5 sessions from 3 shifts, no override needed.
  const ok = await decide(request, { reason: `met ${tag}`, newCtSeconds: 140, evidenceSessionIds: [ids.r1, ids.r2, ids.r3, ids.r4, ids.r5] });
  expect(ok.ok(), await ok.text()).toBeTruthy();
  expect((await ok.json()).evidence).toEqual({ sessions: 5, shifts: 3, met: true });

  const { revisions, audit } = await (await request.get("/api/sop/revisions")).json();
  const draft = revisions.find((r: { id: string }) => r.id === o.revisionId);
  expect(draft.status).toBe("draft");
  expect(draft.changes.find((c: { step: number }) => c.step === 7)).toMatchObject({ newCtSeconds: 140, previousCtSeconds: null, reason: `met ${tag}`, evidenceOverrideReason: null });
  expect(revisions.find((r: { label: string }) => r.label === "A").status).toBe("active"); // nothing activated

  const mine = audit.filter((a: { reason: string | null }) => a.reason?.includes(tag));
  expect(mine.map((a: { action: string }) => a.action).sort()).toEqual(["ct_decided", "ct_decided", "evidence_override"]);
  const overrideEntry = mine.find((a: { action: string }) => a.action === "evidence_override");
  expect(overrideEntry).toMatchObject({ reason: `only three ${tag}`, step: 7, revisionId: o.revisionId, actorName: "Test Admin" });
  expect(mine.find((a: { reason: string }) => a.reason === `met ${tag}`).detail).toMatchObject({ newCtSeconds: 140, minimumMet: true, confirmedByPerson: true });
  // Refused attempts write nothing.
  expect(audit.some((a: { reason: string | null }) => a.reason === `below ${tag}`)).toBe(false);
});

test("the pages: overview numbers, the wizard, sample sessions cannot be ticked, saving a draft", async ({ page }) => {
  const q = `station=${encodeURIComponent(STATION)}&range=all&shift=all`;
  await page.goto(`/dashboard/sop?${q}&sample=0`);
  await expect(page.getByRole("heading", { name: "SOP management" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "SOP management" })).toHaveAttribute("aria-current", "page");
  const row7 = page.getByTestId("sop-steps").locator('tr[data-step="7"]');
  await expect(row7.getByTestId("median")).toHaveText("02:25");
  await expect(row7.getByTestId("sessions")).toHaveText("6");
  await expect(row7.getByTestId("ftc")).toHaveText("83%");
  await expect(row7.getByTestId("target-ct")).toHaveText("not set");
  await expect(page.getByTestId("sop-cautions")).toContainText("Times are button taps, not measured process times.");
  await expect(page.getByTestId("sample-chip")).toHaveCount(0);

  await row7.getByRole("link", { name: "Propose a better way" }).click();
  await expect(page).toHaveURL(/\/dashboard\/sop\/new\?step=7/);
  // The overview stays mounted, hidden, after a client navigation (Next.js keeps it for Back): start clean.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Step 7: Check holes H1 to H14 with check pins" })).toBeVisible();
  await expect(page.getByTestId("stat-median")).toHaveText("02:25");
  await expect(page.getByTestId("stat-fastest")).toHaveText("02:03");
  await expect(page.getByTestId("stat-ftc")).toHaveText("83%");
  await expect(page.getByTestId("stat-by-shift")).toContainText("A 02:00 (3) · B 02:25 (2) · C 03:20 (1)");
  await expect(page.getByTestId("evidence-table").locator("tr[data-session]")).toHaveCount(5);
  await expect(page.getByTestId("sop-cautions")).toContainText("A faster step can also mean a corner was cut.");

  // With sample data on: the SAMPLE chip, and the sample row cannot be ticked.
  await page.goto(`/dashboard/sop/new?step=7&${q}&sample=1`);
  await expect(page.getByTestId("sample-chip")).toBeVisible();
  const sampleRow = page.getByTestId("evidence-table").locator('tr[data-sample="1"]');
  await expect(sampleRow).toHaveCount(1);
  await expect(sampleRow.getByRole("checkbox")).toBeDisabled();
  await expect(sampleRow).toContainText("SAMPLE");

  // Decide: tick 5 real sessions, type the CT, the reason, confirm, save.
  const save = page.getByRole("button", { name: "Save draft" });
  for (const box of await page.getByTestId("evidence-table").locator('tr[data-sample="0"]').getByRole("checkbox").all()) await box.check();
  await expect(page.getByTestId("evidence-count")).toContainText("Evidence ticked: 5 sessions from 3 shifts");
  await page.getByPlaceholder("mm:ss").fill("02:40");
  await expect(page.getByTestId("ct-effect")).toContainText("Step 7: not set → 02:40");
  await page.getByLabel("Reason (required)").fill("Pins tried in row order with the gauge held square. Fewer retries.");
  await expect(save).toBeDisabled(); // not confirmed yet
  await page.getByLabel("I decided this CT. FactoryLens AI did not.").check();
  await expect(page.getByRole("button", { name: "Continue to write the better way" })).toBeDisabled();
  await save.click();
  await expect(page.getByTestId("decision-saved")).toContainText(/Saved in draft revision [B-Z]/);
});

test("access: a Quality Technician gets the access message and 403; signed out gets 401; a Quality Engineer gets the page", async ({ browser, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3100", storageState: { cookies: [], origins: [] } });
  expect((await anon.get("/api/sop/revisions")).status()).toBe(401);
  expect((await anon.post("/api/sop/decisions", { data: {} })).status()).toBe(401);
  await anon.dispose();

  const tech = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const tp = await tech.newPage();
  await signInAs(tp, "technician", "/signin");
  await expect(tp).toHaveURL(/localhost:\d+\/$/);
  await tp.goto("/dashboard/sop");
  await expect(tp.getByRole("heading", { name: "This page is for Quality Engineers" })).toBeVisible();
  await tp.goto("/dashboard/sop/new?step=7");
  await expect(tp.getByRole("heading", { name: "This page is for Quality Engineers" })).toBeVisible();
  expect((await tech.request.get("/api/sop/revisions")).status()).toBe(403);
  expect((await tech.request.post("/api/sop/decisions", { data: { step: 7 } })).status()).toBe(403);
  await tech.close();

  const eng = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const ep = await eng.newPage();
  await signInAs(ep, "engineer", "/dashboard/signin");
  await expect(ep).toHaveURL(/\/dashboard$/);
  await ep.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "SOP management" }).click();
  await expect(ep.getByRole("heading", { name: "SOP management" })).toBeVisible();
  expect((await eng.request.get("/api/sop/revisions")).status()).toBe(200);
  await eng.close();
});
