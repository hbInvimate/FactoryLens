// One-click flow, part 1: SEE. "Check CT trend" and "Ways of working worth a look" on a fixed dataset.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { findCandidates } from "../lib/sop-candidates";
import { signInAs, testUser } from "./auth-helpers";
import { candidateDataset, statSession, timedActions, type TimedSpec } from "./sopFixtures";

const NO_TARGETS = Array<number | null>(12).fill(null);
const data = candidateDataset();
const sessions = data.map(({ key, spec }) => statSession(key, spec));

test.describe("candidates (no browser)", () => {
  test("a Quality Technician faster in all of their last 5 checks is listed, with the faster steps", () => {
    const r = findCandidates(sessions, NO_TARGETS);
    expect(r.stationMedianSeconds).toBe(480);
    expect(r.candidates.map((c) => c.label)).toEqual(["QT-A"]);
    const a = r.candidates[0];
    expect(a.checks).toHaveLength(6); // 6 in a row
    expect(a.medianSeconds).toBe(432);
    expect(a.fasterPercent).toBe(10);
    expect(a.firstTimeCorrect).toBe(100);
    expect(a.fasterSteps).toEqual([5, 7, 9]);
    expect(a.checks.map((c) => c.id)).toEqual(["A5", "A4", "A3", "A2", "A1", "A0"]); // newest first
  });

  test("faster in only 3 of their last 5 checks: not listed", () => {
    const r = findCandidates(sessions, NO_TARGETS);
    expect(r.candidates.some((c) => c.label === "QT-B")).toBe(false);
    expect(r.streaks.find((s) => s.label === "QT-B")).toMatchObject({ streak: 3, checks: 5 });
  });

  test("faster but first-time correct below the station's: not listed", () => {
    const r = findCandidates(sessions, NO_TARGETS);
    expect(r.streaks.find((s) => s.label === "QT-E")?.streak).toBe(5);
    expect(r.candidates.some((c) => c.label === "QT-E")).toBe(false);
  });

  test("sample sessions are never candidates and never move the station numbers", () => {
    const r = findCandidates(sessions, NO_TARGETS);
    expect(r.candidates.some((c) => c.label.includes("sample"))).toBe(false);
    expect(r.streaks.some((s) => s.label.includes("sample"))).toBe(false);
    // Only sample sessions faster: still nobody.
    const onlySample = data.filter((d) => d.spec.sample || d.key.startsWith("C")).map(({ key, spec }) => statSession(key, spec));
    expect(findCandidates(onlySample, NO_TARGETS).candidates).toEqual([]);
    // The same result whether sample sessions are passed in or not.
    expect(findCandidates(sessions.filter((s) => !s.isSample), NO_TARGETS)).toEqual(r);
  });

  test("with a target set, a faster step is judged against the target", () => {
    const targets = [...NO_TARGETS];
    targets[4] = 25; // step 5 target 00:25: A's 26 s is not faster
    expect(findCandidates(sessions, targets).candidates[0].fasterSteps).toEqual([7, 9]);
  });
});

test("the page: the candidate with their label and the video note, others not listed, trend card, SAMPLE chip", async ({ page, request, browser }) => {
  const station = `Laser cell W · FX-${Math.random().toString(36).slice(2, 7)}`;
  /** Saves checks as the signed-in person, so they are theirs (the server stores who saved them). */
  const save = async (req: APIRequestContext, specs: TimedSpec[]) => {
    for (const spec of specs) {
      const id = crypto.randomUUID();
      const { createdAt, actions } = timedActions(id, spec);
      const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: station, station, operator: "typed", createdAt };
      const res = await req.post(`/api/sessions/${id}/actions`, { data: { meta, actions }, headers: spec.sample ? { "x-fl-sample": "1" } : {} });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
  };
  const as = async (who: "technician" | "technician2") => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await signInAs(p, who, "/signin");
    await expect(p).toHaveURL(/localhost:\d+\/$/);
    return ctx;
  };
  const by = (prefix: string) => data.filter((d) => d.key.startsWith(prefix)).map((d) => d.spec);
  // The admin: the median pace (18 checks). Test Quality Technician: A's 6 faster checks. Second: B's 3 of 5.
  await save(request, [...by("C"), ...by("D"), ...by("F")]);
  const t1 = await as("technician");
  await save(t1.request, by("A"));
  const t2 = await as("technician2");
  await save(t2.request, by("B"));
  await save(request, by("S")); // sample: never a candidate

  await page.goto(`/dashboard/sop?station=${encodeURIComponent(station)}&range=all&shift=all&sample=0`);
  const rows = page.getByTestId("candidates-table").locator("tr[data-candidate]");
  await expect(rows).toHaveCount(1);
  const a = rows.first();
  await expect(a).toHaveAttribute("data-candidate", testUser("technician").name);
  await expect(a).toContainText("Video: not recorded yet");
  await expect(a.getByTestId("candidate-median")).toHaveText("07:12");
  await expect(a.getByTestId("candidate-faster")).toHaveText("−10%");
  await expect(a.getByTestId("candidate-streak")).toHaveText("6 in a row");
  await expect(a.getByTestId("candidate-ftc")).toHaveText("100%");
  await expect(a.getByTestId("candidate-steps")).toHaveText("5, 7, 9");
  await expect(page.getByTestId("candidates")).toContainText("Use this to improve the process, not to rank people.");
  await expect(page.getByTestId("ct-trend").locator("svg")).toBeVisible();
  await expect(page.getByTestId("trend-callout")).toHaveText(`Consistently faster: ${testUser("technician").name} below the station median in 6 checks in a row (−10%)`);
  await expect(page.getByTestId("sample-chip")).toHaveCount(0);

  // Sample data on: the trend includes them (SAMPLE chip), the candidates stay real only.
  await page.goto(`/dashboard/sop?station=${encodeURIComponent(station)}&range=all&shift=all&sample=1`);
  await expect(page.getByTestId("sample-chip")).toBeVisible();
  await expect(page.getByTestId("ct-trend")).toContainText("Includes SAMPLE checks.");
  await expect(page.getByTestId("candidates-table").locator("tr[data-candidate]")).toHaveCount(1);
  await t1.close();
  await t2.close();
});