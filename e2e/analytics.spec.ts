// Phase 3: the four dashboard blocks and the tiles, on a small FIXED dataset with known answers.
// Runs the real SQL on PGlite (FL_STORAGE=memory), the same queries as on Neon.
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import {
  checkTimeByShift, conformanceByDay, deviationsByStep, discrepanciesByCategory, summary,
} from "../lib/server/analytics";
import { getRepo, type Repo } from "../lib/server/repo";
import type { DashFilter } from "../lib/server/sqlparts";
import { fromPlantLocal, plantDay, shiftOf } from "../lib/shifts";
import { build, type Spec } from "./fixtures";

process.env.FL_STORAGE = "memory";

const STATION = `Laser cell T · FX-${Math.random().toString(36).slice(2, 7)}`;

/** The fixed dataset. Plant-local dates and times; shifts A 06-14, B 14-22, C 22-06. */
const DATA: Record<string, Spec> = {
  s1: { day: "2026-09-20", time: "08:00", minutes: 30, fixedOnSpot: { step: 2, issue: "Swarf, dross or dust on pads or pins" } },
  s2: { day: "2026-09-20", time: "09:00", minutes: 40, skip: { step: 7, missing: ["H9", "H10", "H11", "H12"] } },
  s3: { day: "2026-09-20", time: "15:00", minutes: 50, wrongOrder: true, skip: { step: 7, missing: ["H9", "H10"] } },
  s4: { day: "2026-09-21", time: "23:30", minutes: 60 },
  s5: { day: "2026-09-22", time: "05:59", minutes: 20, skip: { step: 9, missing: ["T7"] } },
  // Started in shift A at 13:50; the crack is lodged at 14:10, in shift B. Scrapped: ended, not scored.
  s6: { day: "2026-09-22", time: "13:50", lodge: { step: 3, issue: "Crack seen in the part", afterMin: 20, decision: "scrapped" } },
  s7: { day: "2026-09-22", time: "16:00", leaveAtStep: 4 },
  // On hold, no decision: not scored. Lodged at 02:10, shift C.
  s8: { day: "2026-09-24", time: "02:00", lodge: { step: 4, issue: "Round locator pin (RPS-1) will not enter", afterMin: 10 } },
  // Started in shift B at 21:50; a burr lodged at 22:05 (shift C), cleared; the check completes. 45 minutes in all.
  s9: { day: "2026-09-23", time: "21:50", minutes: 45, lodge: { step: 7, issue: "Burr, dross or slug in the hole", afterMin: 15, decision: "cleared" } },
  s11: { day: "2026-09-23", time: "10:00", minutes: 80 },
};

const f = (over: Partial<DashFilter> = {}): DashFilter => ({ station: STATION, since: null, shift: null, includeSample: false, ...over });

let repo: Repo;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  repo = getRepo();
  for (const [key, spec] of Object.entries(DATA)) {
    const id = `${key}-${STATION.slice(-5)}`;
    const { createdAt, actions } = build(id, spec);
    await repo.save({ id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: STATION, station: STATION, operator: "QT-test", createdAt }, actions);
  }
  // An older session saved before missed points were stored: its skip has no point IDs.
  const { db } = await repo.conn();
  await db.execute(sql`update step_events set points = null where session_id = ${`s5-${STATION.slice(-5)}`} and kind = 'skipped'`);
});

test("the dataset is what we think it is", async () => {
  expect(shiftOf(fromPlantLocal("2026-09-21", "23:30"))).toBe("C");
  expect(shiftOf(fromPlantLocal("2026-09-22", "05:59"))).toBe("C");
  expect(plantDay(fromPlantLocal("2026-09-21", "23:30"))).toBe("2026-09-21");
  const { rows } = await repo.dashboard(f());
  const status = Object.fromEntries(rows.map((r) => [r.id.split("-")[0], r.status]));
  expect(status).toEqual({
    s1: "complete", s2: "complete", s3: "complete", s4: "complete", s5: "complete",
    s6: "scrapped", s7: "left", s8: "on_hold", s9: "complete", s11: "complete",
  });
  const conf = Object.fromEntries(rows.map((r) => [r.id.split("-")[0], r.conformance]));
  expect(conf).toMatchObject({ s1: 100, s2: 92, s3: 83, s4: 100, s5: 92, s9: 100, s11: 100, s6: null, s7: null, s8: null });
});

test("tiles: counts by status, conformance and check time from complete sessions only", async () => {
  const s = await summary(await repo.conn(), f());
  expect(s).toMatchObject({
    total: 10, complete: 7, onHold: 1, endedWithoutCheck: 1, left: 1, inProgress: 0,
    scored: 7, noDeviation: 4, timed: 7, untimed: 0, openDiscrepancies: 1, real: 10, sample: 0,
  });
  // (100 + 92 + 83 + 100 + 92 + 100 + 100) / 7 = 95.3
  expect(s.conformance).toBe(95);
  // (30 + 40 + 50 + 60 + 20 + 45 + 80) / 7 minutes = 46:26
  expect(s.avgCheckSeconds).toBe(Math.round((325 * 60) / 7));
  expect(s.oldestHold?.getTime()).toBe(fromPlantLocal("2026-09-24", "02:10"));
});

test("block 1: conformance per plant-local day, overall average and count", async () => {
  const c = await conformanceByDay(await repo.conn(), f());
  expect(c.overall).toBe(95);
  expect(c.count).toBe(7);
  expect(c.days).toEqual([
    { day: "2026-09-20", conformance: 92, count: 3 }, // 100, 92, 83 -> 91.7
    { day: "2026-09-21", conformance: 100, count: 1 }, // the 23:30 session stays on the 21st
    { day: "2026-09-22", conformance: 92, count: 1 }, // 05:59; the scrapped and left sessions are not scored
    { day: "2026-09-23", conformance: 100, count: 2 },
  ]);
});

test("block 2: average and median check time per shift, the 23:30 and 05:59 sessions in shift C", async () => {
  const shifts = await checkTimeByShift(await repo.conn(), f());
  expect(shifts).toEqual([
    { shift: "A", average: 50 * 60, median: 40 * 60, count: 3, untimed: 0 }, // 30, 40, 80
    { shift: "B", average: 47.5 * 60, median: 47.5 * 60, count: 2, untimed: 0 }, // 50, 45 (the burr hold is not a stop)
    { shift: "C", average: 40 * 60, median: 40 * 60, count: 2, untimed: 0 }, // 60 (23:30), 20 (05:59)
  ]);
  // The shift filter does not hide shifts here: block 2 always compares all three.
  expect(await checkTimeByShift(await repo.conn(), f({ shift: "A" }))).toEqual(shifts);
});

test("block 3: top steps, exact missed points, the wrong-order label and points not recorded", async () => {
  const d = await deviationsByStep(await repo.conn(), f());
  expect(d.map((x) => [x.step, x.count])).toEqual([[7, 2], [3, 1], [4, 1], [5, 1], [9, 1]]);
  expect(d[0].items).toEqual([
    { label: "H9 not checked", count: 2, kind: "point" },
    { label: "H10 not checked", count: 2, kind: "point" },
    { label: "H11 not checked", count: 1, kind: "point" },
    { label: "H12 not checked", count: 1, kind: "point" },
  ]);
  expect(d[0].notRecorded).toBe(0);
  expect(d.find((x) => x.step === 5)!.items).toEqual([{ label: "C4 before C3", count: 1, kind: "order" }]);
  expect(d.find((x) => x.step === 3)!.items).toEqual([{ label: "Stopped: Crack seen in the part", count: 1, kind: "cannot" }]);
  // The older session's skip at step 9 has no point IDs: one "not recorded" line, no guess.
  const step9 = d.find((x) => x.step === 9)!;
  expect(step9.items).toEqual([]);
  expect(step9.notRecorded).toBe(1);
});

test("block 4: lodged discrepancies by category, in the shift they were LODGED; fixed on the spot apart", async () => {
  const c = await discrepanciesByCategory(await repo.conn(), f());
  const row = (cat: string) => c.rows.find((r) => r.category === cat)!;
  expect(c.rows).toHaveLength(9);
  // Session s6 started in shift A; its crack was lodged at 14:10, shift B.
  expect(row("Part form or damage")).toMatchObject({ A: 0, B: 1, C: 0, total: 1 });
  // Session s9 started in shift B; its burr was lodged at 22:05, shift C.
  expect(row("Laser cut quality")).toMatchObject({ A: 0, B: 0, C: 1, total: 1 });
  expect(row("Fixture or tooling")).toMatchObject({ A: 0, B: 0, C: 1, total: 1 });
  expect(row("Safety and PPE")).toMatchObject({ A: 0, B: 0, C: 0, total: 0 });
  expect(c.totals).toEqual({ A: 0, B: 1, C: 2, total: 3 });
  expect(c.fixedOnSpot).toEqual({ A: 1, B: 0, C: 0, total: 1 });
});

test("filters: shift and date range narrow the tiles and blocks; held, scrapped and left never scored", async () => {
  const conn = await repo.conn();
  const c = await summary(conn, f({ shift: "C" }));
  expect(c).toMatchObject({ total: 3, complete: 2, onHold: 1, conformance: 96 }); // s4 100, s5 92, s8 on hold
  const day = await conformanceByDay(conn, f({ shift: "C" }));
  expect(day.count).toBe(2);
  const since = await summary(conn, f({ since: new Date(fromPlantLocal("2026-09-23", "00:00")) }));
  expect(since).toMatchObject({ total: 3, complete: 2, onHold: 1, conformance: 100 }); // s9, s11, s8
  // Scrapped and left sessions exist but never count in conformance or check time.
  const all = await summary(conn, f());
  expect(all.endedWithoutCheck + all.left + all.onHold).toBe(3);
  expect(all.scored).toBe(all.complete);
});

test("empty station: nothing to show, nothing guessed", async () => {
  const conn = await repo.conn();
  const empty = f({ station: "No such station" });
  expect(await conformanceByDay(conn, empty)).toEqual({ days: [], overall: null, count: 0 });
  expect((await checkTimeByShift(conn, empty)).every((s) => s.average === null && s.median === null && s.count === 0)).toBe(true);
  expect(await deviationsByStep(conn, empty)).toEqual([]);
  expect((await summary(conn, empty)).conformance).toBeNull();
});
