// Phase 4: the single-session report (/dashboard/[id]): cards, hold, print, back link, old sessions.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { project } from "../lib/check/project";
import { reduce } from "../lib/check/reducer";
import type { Action } from "../lib/check/types";
import { deviationCards, discrepancyCards, listPoints } from "../lib/dashboard/report";
import { shiftOf } from "../lib/shifts";
import { build, type Spec } from "./fixtures";

const uid = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Saves a built session through the real API. `sample` works only on the test server (FL_STORAGE=memory). */
async function post(request: APIRequestContext, station: string, spec: Spec, sample = false): Promise<string> {
  const id = uid();
  const { createdAt, actions } = build(id, spec);
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: station, station, operator: "QT-test (sample)", createdAt };
  const res = await request.post(`/api/sessions/${id}/actions`, {
    data: { meta, actions },
    headers: sample ? { "x-fl-sample": "1" } : {},
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return id;
}

const station = () => `Laser cell R · FX-${Math.random().toString(36).slice(2, 7)}`;

// ---------- card builders (no browser) ----------

function stateOf(id: string, spec: Spec) {
  const { createdAt, actions } = build(id, spec);
  const meta = { id, part: "p", sop: "s", fixture: "f", operator: "o", createdAt };
  return { s: reduce(actions, createdAt), p: project(meta, actions as Action[], Date.now()) };
}

test.describe("report cards", () => {
  test("a skipped step names all four missed points; a wrong clamp order names both clamps; in time order", () => {
    const { s, p } = stateOf("u1", { day: "2026-09-20", time: "08:00", minutes: 40, wrongOrder: true, skip: { step: 7, missing: ["H9", "H10", "H11", "H12"] } });
    const cards = deviationCards(s, p.stepEvents, p.points);
    expect(cards.map((c) => [c.step, c.type])).toEqual([[5, "wrong_order"], [7, "skipped"]]);
    expect(cards[0]).toMatchObject({ happened: "Clamp C4 closed before C3", points: ["C4", "C3"], attempts: 1, corrected: true, expected: "Clamps close in order, one at a time. The part already sits on the pads and pins." });
    expect(cards[1]).toMatchObject({ happened: "Holes H9, H10, H11, H12 not checked", points: ["H9", "H10", "H11", "H12"], attempts: 1, corrected: true, expected: "A check pin tried at every hole, in order." });
    expect(cards[1].clip).toMatchObject({ missing: ["H9", "H10", "H11", "H12"], ordered: false });
    expect(cards[0].clip).toMatchObject({ wrong: "C4", expected: "C3", ordered: true });
  });

  test("a session saved before points were stored: 'points not recorded', never a guess", () => {
    const { s, p } = stateOf("u2", { day: "2026-09-20", time: "08:00", minutes: 40, skip: { step: 9, missing: ["T7"] } });
    // As stored by older code: no point IDs on the event, and no confirmations to work them out from.
    const old = p.stepEvents.map((e) => ({ ...e, points: null }));
    const cards = deviationCards(s, old, []);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ happened: "Points not recorded", points: null, clip: null });
    // With the point confirmations still there, the points are worked out from them.
    expect(deviationCards(s, old, p.points)[0].happened).toBe("Trim edge point T7 not checked");
  });

  test("a stop is a 'cannot do' card; discrepancy outcomes in plain words", () => {
    const { s } = stateOf("u3", { day: "2026-09-22", time: "13:50", lodge: { step: 3, issue: "Crack seen in the part", afterMin: 20, decision: "scrapped" } });
    const cards = deviationCards(s, [], []);
    expect(cards).toEqual([expect.objectContaining({ type: "cannot_do", step: 3, happened: "The check was stopped. Crack seen in the part" })]);
    expect(discrepancyCards(s)).toEqual([expect.objectContaining({ issue: "Crack seen in the part", category: "Part form or damage", stopped: true, outcome: "Part scrapped" })]);

    const legacy = stateOf("u4", { day: "2026-09-22", time: "09:00", lodge: { step: 3, issue: "Crack seen in the part", afterMin: 5 }, legacyClear: "cleared" }).s;
    expect(discrepancyCards(legacy)[0].outcome).toBe("Part held (cleared)");
    const fixed = stateOf("u5", { day: "2026-09-22", time: "09:00", minutes: 30, fixedOnSpot: { step: 2, issue: "Swarf, dross or dust on pads or pins" } }).s;
    expect(discrepancyCards(fixed)[0]).toMatchObject({ outcome: "Fixed on the spot", fixedOnSpot: true, category: "Setup, cleanliness and labelling" });
    expect(listPoints(["S2", "N1", "N2"])).toBe("Slot S2, notches N1, N2");
  });
});

// ---------- the page ----------

test("report page: what went wrong, clip next to reference, discrepancies, hold with decision, footnote", async ({ page, request }) => {
  const st = station();
  const id = await post(request, st, {
    day: "2026-09-20", time: "08:00", minutes: 45, wrongOrder: true, skip: { step: 7, missing: ["H9", "H10", "H11", "H12"] },
    fixedOnSpot: { step: 2, issue: "Swarf, dross or dust on pads or pins" },
    lodge: { step: 9, issue: "Burr, dross or spatter on the edge", afterMin: 30, decision: "cleared", by: "Process engineer", reason: "Assist gas corrected", called: "Laser operator" },
  });
  await page.goto(`/dashboard/${id}`);
  await expect(page.getByRole("heading", { name: "Post-session review" })).toBeVisible();

  const dev = page.getByTestId("deviation-card");
  await expect(dev).toHaveCount(2);
  await expect(dev.nth(0)).toContainText("Step 5: Close clamps lightly, C1 to C6");
  await expect(dev.nth(0).getByTestId("happened")).toHaveText("Clamp C4 closed before C3");
  await expect(dev.nth(1).getByTestId("happened")).toHaveText("Holes H9, H10, H11, H12 not checked");
  await expect(dev.nth(1)).toContainText("Expected: A check pin tried at every hole, in order.");
  await expect(dev.nth(1)).toContainText("Attempt 1");
  await expect(dev.nth(1).getByTestId("corrected")).toContainText("Corrected on the first retry");

  await dev.nth(1).getByRole("button", { name: "View clip next to reference" }).click();
  const clip = dev.nth(1).getByTestId("clip");
  await expect(clip.getByText(/^Clip placeholder: Quality Technician/)).toBeVisible();
  await expect(clip.getByText(/^Clip placeholder: reference from training/)).toBeVisible();
  await expect(clip.getByRole("img", { name: "Quality Technician: H9, H10, H11, H12 not checked" })).toBeVisible();
  await expect(clip.getByRole("img", { name: "Reference: all 14 checked" })).toBeVisible();
  await dev.nth(1).getByRole("button", { name: "Hide clip" }).click();
  await expect(clip).toHaveCount(0);

  const disc = page.getByTestId("discrepancy-card");
  await expect(disc).toHaveCount(2);
  await expect(disc.nth(0)).toContainText("Swarf, dross or dust on pads or pins");
  await expect(disc.nth(0)).toContainText("Setup, cleanliness and labelling");
  await expect(disc.nth(0).getByTestId("discrepancy-outcome")).toHaveText("Fixed on the spot");
  await expect(disc.nth(1)).toContainText("Step 9: Check trim edges T1 to T14 — Burr, dross or spatter on the edge");
  await expect(disc.nth(1)).toContainText("Laser cut quality");
  await expect(disc.nth(1)).toContainText("The check could continue.");
  await expect(disc.nth(1)).toContainText("marked called: Laser operator");
  await expect(disc.nth(1).getByTestId("discrepancy-outcome")).toHaveText("Cleared, the check continues");

  const hold = page.getByTestId("hold-section");
  await expect(hold).toContainText("Burr, dross or spatter on the edge · Laser cut quality · the check continued");
  await expect(hold.getByTestId("hold-decision")).toContainText("Cleared, the check continues, decided by Process engineer");
  await expect(hold.getByTestId("hold-decision")).toContainText("Reason: Assist gas corrected");
  await expect(hold).toContainText("Waiting time");

  await expect(page.getByTestId("footnote")).toHaveText(
    "Sequence conformance = steps done correctly on the first attempt divided by 12. It measures the procedure, not the part. Readings and tolerances stay in the tablet quality data tool.",
  );
  await expect(page.getByRole("button", { name: "Send to quality system" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Replay this session" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Open in the check app" })).toHaveAttribute("href", `/check/${id}`);
  await expect(page.getByText("(SOP step")).toHaveCount(0);
});

test("a session that was never on hold has no Hold section", async ({ page, request }) => {
  const id = await post(request, station(), { day: "2026-09-20", time: "08:00", minutes: 30 });
  await page.goto(`/dashboard/${id}`);
  await expect(page.getByTestId("report-outcome")).toContainText("Complete");
  await expect(page.getByTestId("hold-section")).toHaveCount(0);
  await expect(page.getByText("No deviations. Every step was done correctly on the first attempt.")).toBeVisible();
});

test("print: A4 portrait, no menus or buttons, printed-on time, cards kept whole, SAMPLE DATA mark", async ({ page, request }) => {
  const id = await post(request, station(), { day: "2026-09-20", time: "08:00", minutes: 40, skip: { step: 7, missing: ["H9", "H10", "H11", "H12"] } }, true);
  await page.goto(`/dashboard/${id}`);
  await expect(page.getByTestId("deviation-card")).toHaveCount(1);
  await expect(page.getByTestId("sample-mark")).toBeVisible();
  await expect(page.getByTestId("printed-on")).toBeHidden(); // paper only

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(page.getByTestId("report-actions")).toBeHidden();
  await expect(page.getByRole("button", { name: "Export report (PDF)" })).toBeHidden();
  await expect(page.getByRole("button", { name: "View clip next to reference" })).toBeHidden();
  await expect(page.getByTestId("back-to-dashboard")).toBeHidden();
  await expect(page.getByText("Anyone with the link")).toHaveCount(0);
  await expect(page.getByTestId("printed-on")).toBeVisible();
  await expect(page.getByTestId("printed-on")).toHaveText(/^Printed on .+\d/);
  await expect(page.getByTestId("sample-mark")).toBeVisible();
  await expect(page.getByText("FactoryLens AI · Session report")).toBeVisible();
  await expect(page.getByText(/^Station/)).toBeVisible();
  await expect(page.getByText(/^Session date/)).toBeVisible();
  const breakInside = await page.getByTestId("deviation-card").evaluate((el) => getComputedStyle(el).breakInside);
  expect(breakInside).toBe("avoid");
  // The @page rule (inside @media print): A4 portrait.
  const pageSizes = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const r of [...rules]) {
        if (r instanceof CSSPageRule) found.push(r.style.getPropertyValue("size"));
        if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of [...document.styleSheets]) {
      try {
        walk(sheet.cssRules);
      } catch {
        // a sheet from another origin: not ours
      }
    }
    return found;
  });
  // Chrome stores "A4 portrait" as "a4": portrait is A4's default orientation.
  expect(pageSizes.some((s) => /^a4( portrait)?$/i.test(s))).toBe(true);
});

test("Back to the dashboard keeps station, range, shift and the sample switch", async ({ page, request }) => {
  const st = station();
  const now = new Date();
  const local = new Date(now.getTime() - 5 * 60_000);
  const day = local.toISOString().slice(0, 10);
  // A session started a few minutes ago, so it falls in the current range and shift.
  const id = uid();
  const createdAt = local.getTime();
  const { actions } = build(id, { day, time: "00:00", minutes: 1 });
  const shifted = actions.map((a, i) => ({ ...a, at: createdAt + (i + 1) * 500 }));
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: st, station: st, operator: "QT-test", createdAt };
  expect((await request.post(`/api/sessions/${id}/actions`, { data: { meta, actions: shifted } })).ok()).toBeTruthy();

  const shift = shiftOf(createdAt);
  await page.goto(`/dashboard?station=${encodeURIComponent(st)}&range=7&shift=${shift}&sample=0`);
  await page.locator(`tr[data-session="${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/${id}\\?`));
  await page.getByTestId("back-to-dashboard").click();
  await expect(page).toHaveURL(/\/dashboard\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("station")).toBe(st);
  expect(url.searchParams.get("range")).toBe("7");
  expect(url.searchParams.get("shift")).toBe(shift);
  expect(url.searchParams.get("sample")).toBe("0");
  await expect(page.getByLabel("Station")).toHaveValue(st);
  await expect(page.getByLabel("Date range")).toHaveValue("7");
  await expect(page.getByLabel("Shift", { exact: true })).toHaveValue(shift);
  await expect(page.getByLabel("Include sample data")).not.toBeChecked();
});

test("a session that does not exist shows Session not found", async ({ page }) => {
  await page.goto("/dashboard/no-such-session-123");
  await expect(page.getByTestId("session-not-found")).toHaveText("Session not found");
  await expect(page.getByRole("link", { name: "Back to the dashboard" })).toBeVisible();
});

test("old-session smoke test: every kind of session opens without an error", async ({ page, request }) => {
  const st = station();
  const specs: Spec[] = [
    { day: "2026-08-01", time: "08:00", minutes: 30 }, // clean
    { day: "2026-08-01", time: "09:00", lodge: { step: 3, issue: "Crack seen in the part", afterMin: 5 }, legacyClear: "scrapped" }, // part held, old flow
    { day: "2026-08-01", time: "10:00", lodge: { step: 4, issue: "Round locator pin (RPS-1) will not enter", afterMin: 5 } }, // on hold, no decision
    { day: "2026-08-01", time: "11:00", leaveAtStep: 3 }, // left
    { day: "2026-08-01", time: "12:00", stopAfterStep: 6, skip: { step: 5, missing: ["C5", "C6"] } }, // running, a skip on clamps
    { day: "2026-08-01", time: "13:00", lodge: { step: 1, issue: "Guard, clamp or edge looks unsafe", afterMin: 2, decision: "abandoned" } }, // abandoned
    { day: "2026-08-01", time: "14:00", lodge: { step: 7, issue: "Several holes will not take the pin, same direction", afterMin: 20, decision: "concession" } },
  ];
  const ids = [];
  for (const s of specs) ids.push(await post(request, st, s));
  // And a session that was created but has no actions at all.
  const empty = uid();
  expect((await request.post(`/api/sessions/${empty}/actions`, {
    data: { meta: { id: empty, part: "B-pillar outer", sop: "First-off check, rev A", fixture: st, operator: "QT-test", createdAt: Date.now() - 60_000 }, actions: [] },
  })).ok()).toBeTruthy();
  ids.push(empty);

  for (const id of ids) {
    await page.goto(`/dashboard/${id}`);
    await expect(page.getByRole("heading", { name: "Post-session review" }), id).toBeVisible();
    await expect(page.getByTestId("steps-table")).toBeVisible();
    await expect(page.getByTestId("report-outcome")).toBeVisible();
    await expect(page.getByText(/Could not load|Something went wrong/)).toHaveCount(0);
  }
  await page.goto(`/dashboard/${ids[1]}`);
  await expect(page.getByTestId("report-outcome")).toContainText("Part held and not scored");
  await expect(page.getByTestId("hold-decision")).toContainText("recorded before hold decisions");
  await page.goto(`/dashboard/${ids[4]}`);
  await expect(page.getByTestId("happened")).toHaveText("Clamps C5, C6 not closed");
  await page.goto(`/dashboard/${ids[7]}`);
  await expect(page.getByTestId("report-conformance")).toHaveText("In progress");
});
