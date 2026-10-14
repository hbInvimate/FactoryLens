// Dashboard phase 2: shifts, active time, missed points, categories, sample data.
import { expect, test } from "@playwright/test";
import { project } from "../lib/check/project";
import { activeCheckMs, reduce } from "../lib/check/reducer";
import type { Action, ActionBody } from "../lib/check/types";
import { PLANT_TIME_ZONE } from "../lib/config";
import { includeSampleFor } from "../lib/dashboard/metrics";
import { missedPoints } from "../lib/dashboard/missed";
import { CATEGORIES, issuesFor, ISSUES } from "../lib/issues";
import { generateSample } from "../lib/sample/generate";
import { clearSample, seedSample } from "../lib/sample/seed";
import { getRepo } from "../lib/server/repo";
import { shiftOf } from "../lib/shifts";
import { STEPS } from "../lib/sop";
import { doSteps, startCheck, tap, waitSaved } from "./helpers";

const MIN = 60_000;

// ---------- shifts ----------

test.describe("shiftOf", () => {
  const LA = "America/Los_Angeles"; // UTC-7 in October (daylight time)
  const at = (local: string) => new Date(`${local}-07:00`);

  test("uses the plant time zone, start inclusive, end exclusive", () => {
    expect(shiftOf(at("2026-10-14T23:30:00"), LA)).toBe("C");
    expect(shiftOf(at("2026-10-14T05:59:00"), LA)).toBe("C");
    expect(shiftOf(at("2026-10-14T06:00:00"), LA)).toBe("A");
    expect(shiftOf(at("2026-10-14T13:59:00"), LA)).toBe("A");
    expect(shiftOf(at("2026-10-14T14:00:00"), LA)).toBe("B");
    expect(shiftOf(at("2026-10-14T21:59:00"), LA)).toBe("B");
    expect(shiftOf(at("2026-10-14T22:00:00"), LA)).toBe("C");
    expect(shiftOf(at("2026-10-15T00:10:00"), LA)).toBe("C");
  });

  test("the same instant falls in a different shift in another time zone, never UTC by accident", () => {
    const instant = new Date("2026-10-14T21:30:00Z"); // 14:30 in Los Angeles, 03:00 next day in India
    expect(shiftOf(instant, LA)).toBe("B");
    expect(shiftOf(instant, "Asia/Kolkata")).toBe("C");
    expect(shiftOf(instant)).toBe(shiftOf(instant, PLANT_TIME_ZONE));
  });

  test("works across a daylight-saving change", () => {
    // 1 November 2026: Los Angeles goes back to UTC-8.
    expect(shiftOf(new Date("2026-11-02T05:59:00-08:00"), LA)).toBe("C");
    expect(shiftOf(new Date("2026-11-02T06:00:00-08:00"), LA)).toBe("A");
  });
});

// ---------- a hand-built action log ----------

function runner(start: number) {
  const actions: Action[] = [];
  let t = start;
  let seq = 0;
  const push = (body: ActionBody, afterMs = 1000) => {
    t += afterMs;
    seq += 1;
    actions.push({ ...body, id: `u-${seq}-${start}`, seq, at: t } as Action);
    return actions[actions.length - 1];
  };
  /** Does steps from..to correctly, 1 second per tap. Optional missed points on one step. */
  const steps = (from: number, to: number, skip?: { step: number; missing: string[] }) => {
    for (let n = from; n <= to; n++) {
      const s = STEPS[n - 1];
      for (const p of s.points) if (!(skip?.step === n && skip.missing.includes(p))) push({ type: "tap_point", step: n, point: p });
      const next = push({ type: "next_step", step: n });
      if (skip?.step === n) {
        for (const p of skip.missing) push({ type: "tap_point", step: n, point: p });
        push({ type: "fix_continue", deviation: next.id });
      }
    }
  };
  return { actions, push, steps, now: () => t };
}

test.describe("active time", () => {
  test("start to finish minus a pause", () => {
    const start = Date.UTC(2026, 9, 14, 8, 0, 0);
    const r = runner(start);
    r.steps(1, 6);
    r.push({ type: "pause" });
    r.push({ type: "resume" }, 5 * MIN);
    r.steps(7, 12);
    const s = reduce(r.actions, start);
    const total = r.now() - start;
    expect(s.status).toBe("complete");
    // The pause lasted 5 minutes exactly (from the pause tap to the resume tap).
    expect(activeCheckMs(s)).toBe(total - 5 * MIN);
  });

  test("a stop hold cleared mid-check is not counted, and a pause inside it is not taken off twice", () => {
    const start = Date.UTC(2026, 9, 14, 8, 0, 0);
    const r = runner(start);
    r.steps(1, 2);
    r.push({ type: "lodge", did: "d-hold", step: 3, issue: "Part rocks, or a gap shows at a pad", tried: [] });
    const lodgedAt = r.now();
    r.push({ type: "pause" }, 1 * MIN); // the pause is inside the hold
    r.push({ type: "resume" }, 2 * MIN);
    const decision = r.push({ type: "hold_decision", did: "d-hold", outcome: "cleared", by: "Process engineer", reason: "Reseated", decidedAt: 0 }, 7 * MIN);
    r.steps(3, 12);
    const s = reduce(r.actions, start);
    const total = r.now() - start;
    expect(s.status).toBe("complete");
    expect(activeCheckMs(s)).toBe(total - (decision.at - lodgedAt));
  });

  test("no finish time, no check time", () => {
    const start = Date.UTC(2026, 9, 14, 8, 0, 0);
    const r = runner(start);
    r.steps(1, 7);
    expect(activeCheckMs(reduce(r.actions, start))).toBeNull();
    expect(project({ id: "u-open", part: "p", sop: "s", fixture: "f", operator: "o", createdAt: start }, r.actions, r.now()).session.activeSeconds).toBeNull();
  });
});

test.describe("missed points", () => {
  test("a skipped step stores the IDs of the missed points; a wrong order stores both clamps", () => {
    const start = Date.UTC(2026, 9, 14, 8, 0, 0);
    const r = runner(start);
    r.steps(1, 4);
    r.push({ type: "tap_point", step: 5, point: "C1" });
    r.push({ type: "tap_point", step: 5, point: "C2" });
    const wrong = r.push({ type: "tap_point", step: 5, point: "C4" });
    r.push({ type: "release_clamps", step: 5 });
    for (const c of ["C1", "C2", "C3", "C4", "C5", "C6"]) r.push({ type: "tap_point", step: 5, point: c });
    r.push({ type: "fix_continue", deviation: wrong.id });
    r.steps(6, 12, { step: 7, missing: ["H9", "H10", "H11", "H12"] });

    const p = project({ id: "u-miss", part: "p", sop: "s", fixture: "f", operator: "o", createdAt: start }, r.actions, r.now());
    const skipped = p.stepEvents.find((e) => e.kind === "skipped")!;
    expect(skipped.step).toBe(7);
    expect(skipped.points).toEqual(["H9", "H10", "H11", "H12"]);
    expect(p.stepEvents.find((e) => e.kind === "wrong_order")!.points).toEqual(["C4", "C3"]);
    expect(p.stepEvents.find((e) => e.kind === "done")!.points).toBeNull();
    expect(p.session.conformance).toBe(83);

    // Older rows without stored IDs: worked out from the point confirmations.
    expect(missedPoints({ ...skipped, points: null }, p.points)).toEqual(["H9", "H10", "H11", "H12"]);
    // No confirmations for that step at all: not recorded, never a guess.
    expect(missedPoints({ ...skipped, points: null }, [])).toBeNull();
  });

  test("shown on the session page after a real check", async ({ page }) => {
    const id = await startCheck(page);
    await doSteps(page, 1, 6);
    await tap(page, 7, ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H13", "H14"]);
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await tap(page, 7, ["H9", "H10", "H11", "H12"], "your view");
    await page.getByRole("button", { name: "Fixed, continue" }).click();
    await waitSaved(page);
    await page.goto(`/sessions/${id}`);
    await expect(page.getByTestId("missed-points")).toHaveText("Missed points: H9, H10, H11, H12");
  });
});

test("every issue in the catalogue has one of the 9 categories, stored on lodged discrepancies", () => {
  expect(CATEGORIES).toHaveLength(9);
  const all = Object.values(ISSUES).flat();
  expect(all).toHaveLength(54);
  for (const i of all) expect(CATEGORIES).toContain(i.category);
  expect(issuesFor(7).find((i) => i.label === "Several holes will not take the pin, same direction")!.category).toBe("Laser cut quality");

  const start = Date.UTC(2026, 9, 14, 8, 0, 0);
  const r = runner(start);
  r.steps(1, 6);
  r.push({ type: "lodge", did: "d-cat", step: 7, issue: "Several holes will not take the pin, same direction", tried: [] });
  const p = project({ id: "u-cat", part: "p", sop: "s", fixture: "f", operator: "o", createdAt: start }, r.actions, r.now());
  expect(p.discrepancies[0].category).toBe("Laser cut quality");
});

// ---------- sample data ----------

test.describe("sample data", () => {
  test("about 60 realistic sessions over 30 days, all shifts, all categories, H9 to H12 most skipped", () => {
    const now = Date.UTC(2026, 9, 14, 12, 0, 0);
    const sessions = generateSample(now);
    expect(sessions).toHaveLength(60);
    expect(new Set(sessions.map((s) => s.meta.id)).size).toBe(60);
    for (const s of sessions) {
      expect(s.meta.createdAt).toBeLessThan(now);
      expect(s.meta.createdAt).toBeGreaterThan(now - 31 * 24 * 60 * MIN);
    }
    expect(new Set(sessions.map((s) => shiftOf(s.meta.createdAt)))).toEqual(new Set(["A", "B", "C"]));

    const states = sessions.map((s) => reduce(s.actions, s.meta.createdAt));
    const statuses = states.map((s) => s.status);
    for (const st of ["complete", "scrapped", "rework", "concession", "left", "on_hold"]) expect(statuses).toContain(st);
    expect(statuses.filter((s) => s === "complete").length).toBeGreaterThan(35);

    const lodgedCategories = new Set(states.flatMap((s) => s.discrepancies.filter((d) => d.status !== "fixed_on_spot").map((d) => d.category)));
    for (const c of CATEGORIES) expect(lodgedCategories, `category ${c}`).toContain(c);
    expect(states.some((s) => s.discrepancies.some((d) => d.status === "fixed_on_spot"))).toBe(true);

    const skips = new Map<string, number>();
    for (const s of states) for (const e of s.stepEvents) if (e.kind === "skipped") for (const p of e.points) skips.set(p, (skips.get(p) ?? 0) + 1);
    const top = [...skips.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p]) => p).sort();
    expect(top).toEqual(["H10", "H11", "H12", "H9"]);
    expect(states.some((s) => s.stepEvents.some((e) => e.kind === "wrong_order" && e.points.join() === "C4,C3"))).toBe(true);

    const times = states.map((s) => activeCheckMs(s)).filter((x): x is number => x !== null);
    const avgMin = times.reduce((a, b) => a + b, 0) / times.length / MIN;
    expect(avgMin).toBeGreaterThan(25);
    expect(avgMin).toBeLessThan(70);
  });

  test("seed and clear: safe to run twice, real sessions untouched", async () => {
    process.env.FL_STORAGE = "memory";
    const repo = getRepo();
    await repo.save({ id: "real-session-1", part: "p", sop: "s", fixture: "f", operator: "o", createdAt: Date.now() - MIN }, []);
    const before = await repo.counts();

    const first = await seedSample(repo);
    expect(first.total).toBe(60);
    const second = await seedSample(repo);
    expect(second.total).toBe(60);
    expect(second.before).toBe(60);
    expect((await repo.counts()).real).toBe(before.real);

    const station = "Laser cell 3 · FX-014";
    const view = { station, since: null, shift: null };
    expect((await repo.dashboard({ ...view, includeSample: true })).rows.filter((r) => r.isSample)).toHaveLength(60);
    expect((await repo.dashboard({ ...view, includeSample: false })).rows.filter((r) => r.isSample)).toHaveLength(0);

    expect(await clearSample(repo)).toBe(60);
    expect(await clearSample(repo)).toBe(0);
    const after = await repo.counts();
    expect(after.sample).toBe(0);
    expect(after.real).toBe(before.real);
    expect(await repo.journal("real-session-1")).not.toBeNull();
  });

  test("Include sample data: on by default below 10 real sessions; the URL can override", () => {
    expect(includeSampleFor(undefined, 0)).toBe(true);
    expect(includeSampleFor(undefined, 9)).toBe(true);
    expect(includeSampleFor(undefined, 10)).toBe(false);
    expect(includeSampleFor("0", 0)).toBe(false);
    expect(includeSampleFor("1", 50)).toBe(true);
  });

  test("dashboard shows the switch and the SAMPLE DATA chip when it is on", async ({ page }) => {
    await page.goto("/dashboard?sample=1&range=all");
    await expect(page.getByLabel("Include sample data")).toBeChecked();
    await expect(page.getByTestId("sample-chip")).toHaveText(/^SAMPLE DATA · \d+ real, \d+ sample sessions?$/);
    await page.getByLabel("Include sample data").uncheck();
    await expect(page).toHaveURL(/sample=0/);
    await expect(page.getByTestId("sample-chip")).toHaveCount(0);
  });
});
