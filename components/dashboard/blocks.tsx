// The four analytics blocks on /dashboard (docs/dashboard/screens/d6). Server components: each runs one
// grouped query. Every bar and cell carries its number; colour is never the only signal.
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PLANT_TIME_ZONE, SHIFTS, type ShiftId } from "@/lib/config";
import { fmtClock } from "@/lib/format";
import {
  checkTimeByShift, conformanceByDay, deviationsByStep, discrepanciesByCategory,
} from "@/lib/server/analytics";
import { getRepo } from "@/lib/server/repo";
import type { DashFilter } from "@/lib/server/sqlparts";
import { plantDay } from "@/lib/shifts";
import { step as sopStep } from "@/lib/sop";
import { cx } from "../ui";
import { BlockBoundary } from "./BlockBoundary";
import { Card, LChip } from "./light";

export function Block({ n, title, sub, children, testId }: { n: number; title: string; sub: ReactNode; children: ReactNode; testId: string }) {
  const full = `${n}. ${title}`;
  return (
    <Card className="flex min-w-0 flex-col px-5 py-4">
      <h2 className="text-[19px] font-semibold">{full}</h2>
      <p className="pb-2 text-[13px] text-muted">{sub}</p>
      <section data-testid={testId} aria-label={full} className="flex min-h-[180px] flex-col">
        <BlockBoundary title={title}>
          <Suspense fallback={<BlockSkeleton />}>{children}</Suspense>
        </BlockBoundary>
      </section>
    </Card>
  );
}

function BlockSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-1 flex-col gap-2 py-2">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-surface-3" style={{ width: `${90 - i * 12}%` }} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center py-8 text-[15px] text-muted" data-testid="block-empty">
      {children}
    </p>
  );
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= end && out.length < 400; d += 86_400_000) {
    out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

// ---------- 1 ----------

export async function ConformanceBlock({ f, today }: { f: DashFilter; today: string }) {
  const c = await conformanceByDay(await getRepo().conn(), f);
  if (!c.count) return <Empty>No completed sessions in this range.</Empty>;
  const from = f.since ? plantDay(f.since) : c.days[0].day;
  const days = daysBetween(from, today);
  const byDay = new Map(c.days.map((d) => [d.day, d]));
  const W = 800;
  const H = 190;
  const top = 18;
  const bottom = 22;
  const slot = W / days.length;
  const bw = Math.max(2, slot * 0.62);
  const y = (pct: number) => top + (H - top - bottom) * (1 - pct / 100);
  const narrow = slot < 20;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Conformance per day. Overall ${c.overall}% over ${c.count} sessions.`}>
        <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} stroke="var(--fl-border-strong)" />
        {days.map((d, i) => {
          const b = byDay.get(d);
          const x = i * slot + (slot - bw) / 2;
          const tip = b ? `${fmtDay(d)}: ${b.conformance}%, ${b.count} ${b.count === 1 ? "session" : "sessions"}` : `${fmtDay(d)}: no completed sessions`;
          return (
            <g key={d} data-day={d}>
              <title>{tip}</title>
              {b ? (
                <>
                  <rect x={x} y={y(b.conformance)} width={bw} height={H - bottom - y(b.conformance)} rx="2" fill="var(--fl-primary)" />
                  <text
                    x={x + bw / 2}
                    y={y(b.conformance) - 4}
                    textAnchor={narrow ? "start" : "middle"}
                    fontSize={narrow ? 8 : 11}
                    fill="var(--fl-text)"
                    transform={narrow ? `rotate(-90 ${x + bw / 2} ${y(b.conformance) - 4})` : undefined}
                  >
                    {b.conformance}
                  </text>
                </>
              ) : (
                <rect x={x} y={H - bottom - 2} width={bw} height="2" fill="var(--fl-border)" />
              )}
            </g>
          );
        })}
        {c.overall !== null && (
          <line x1="0" x2={W} y1={y(c.overall)} y2={y(c.overall)} stroke="var(--fl-amber)" strokeDasharray="6 4" strokeWidth="1.5">
            <title>{`Overall ${c.overall}%`}</title>
          </line>
        )}
        <text x="0" y={H - 6} fontSize="10" fill="var(--fl-text-muted)">{fmtDay(days[0])}</text>
        <text x={W} y={H - 6} fontSize="10" fill="var(--fl-text-muted)" textAnchor="end">{fmtDay(days[days.length - 1])}</text>
      </svg>
      <p className="text-[14px] text-ink-2" data-testid="conformance-overall">
        Overall <b>{c.overall}%</b> over {c.count} completed {c.count === 1 ? "session" : "sessions"}{" "}
        <span className="text-amber-ink">(dashed line)</span>.
      </p>
      <p className="pt-1 text-[12px] text-muted">
        Conformance = steps correct on the first attempt ÷ 12, averaged across completed sessions. Held, scrapped, left and running sessions are not scored.
      </p>
    </>
  );
}

// ---------- 2 ----------

export async function CheckTimeBlock({ f }: { f: DashFilter }) {
  const shifts = await checkTimeByShift(await getRepo().conn(), f);
  if (shifts.every((s) => s.count === 0)) return <Empty>No completed sessions in this range.</Empty>;
  const max = Math.max(...shifts.map((s) => s.average ?? 0), 1);
  return (
    <>
      <div className="flex flex-col gap-3">
        {shifts.map((s) => {
          const def = SHIFTS.find((x) => x.id === s.shift)!;
          const dim = f.shift !== null && f.shift !== s.shift;
          return (
            <div key={s.shift} data-shift={s.shift} className={cx("grid grid-cols-[150px_1fr_auto] items-center gap-3", dim && "opacity-40")}>
              <span className="text-[15px]">
                Shift {s.shift} {def.start} to {def.end}
              </span>
              <span className="h-7 rounded bg-surface-3" aria-hidden>
                {s.average !== null && <span className="block h-7 rounded bg-blue" style={{ width: `${(s.average / max) * 100}%` }} />}
              </span>
              <span className="flex min-w-[190px] flex-col text-[15px]">
                {s.average === null ? (
                  <span className="text-muted">not recorded</span>
                ) : (
                  <>
                    <span>
                      <b data-testid="shift-average">{fmtClock(s.average * 1000)}</b>{" "}
                      <span className="text-muted">
                        ({s.count} {s.count === 1 ? "session" : "sessions"})
                      </span>{" "}
                      {s.count < 5 && <LChip tone="amber">Low volume</LChip>}
                    </span>
                    <span className="text-[13px] text-ink-2" data-testid="shift-median">
                      median {fmtClock((s.median ?? 0) * 1000)}
                    </span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="pt-3 text-[12px] text-muted">
        Shifts (assumed, editable in lib/config.ts): {SHIFTS.map((s) => `${s.id} ${s.start} to ${s.end}`).join(", ")}, plant time ({PLANT_TIME_ZONE}). A session
        belongs to the shift it started in.
        {shifts.some((s) => s.untimed) && ` ${shifts.reduce((n, s) => n + s.untimed, 0)} completed sessions have no recorded time and are left out.`}
      </p>
    </>
  );
}

// ---------- 3 ----------

export async function DeviationsBlock({ f, devHref, active }: { f: DashFilter; devHref: (step: number | null) => string; active: number | null }) {
  const steps = await deviationsByStep(await getRepo().conn(), f);
  if (!steps.length) return <Empty>No deviations in this range.</Empty>;
  const max = Math.max(...steps.map((s) => s.count), ...steps.flatMap((s) => s.items.map((i) => i.count)), 1);
  const bar = (n: number, tone: "red" | "amber" | "gray") => (
    <span className="h-5 rounded bg-surface-3" aria-hidden>
      <span
        className={cx("block h-5 rounded", tone === "red" ? "bg-red" : tone === "amber" ? "bg-amber" : "bg-subtle")}
        style={{ width: `${(n / max) * 100}%` }}
      />
    </span>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((s) => (
        <div key={s.step} className="flex flex-col gap-1" data-step={s.step}>
          <Link
            href={devHref(s.step)}
            scroll={false}
            aria-current={active === s.step ? "true" : undefined}
            title="Show only sessions with this deviation"
            className={cx(
              "grid min-h-[40px] grid-cols-[minmax(0,330px)_1fr_36px] items-center gap-3 rounded px-1 hover:bg-blue-soft",
              active === s.step && "bg-blue-soft ring-2 ring-blue",
            )}
          >
            <span className="text-[15px] font-semibold leading-tight">
              Step {s.step}: {sopStep(s.step).name}
            </span>
            {bar(s.count, "red")}
            <span className="text-right text-[15px] font-semibold" data-testid="step-count">{s.count}</span>
          </Link>
          {s.items.map((i) => (
            <div key={i.label} className="grid grid-cols-[minmax(0,330px)_1fr_36px] items-center gap-3 px-1 pl-7" data-item={i.label}>
              <span className="text-[14px] leading-tight text-ink-2">{i.label}</span>
              {bar(i.count, "amber")}
              <span className="text-right text-[14px]">{i.count}</span>
            </div>
          ))}
          {s.notRecorded > 0 && (
            <div className="grid grid-cols-[minmax(0,330px)_1fr_36px] items-center gap-3 px-1 pl-7" data-item="not-recorded">
              <span className="text-[14px] italic text-muted">
                points not recorded ({s.notRecorded} {s.notRecorded === 1 ? "session" : "sessions"})
              </span>
              {bar(s.notRecorded, "gray")}
              <span className="text-right text-[14px]">{s.notRecorded}</span>
            </div>
          )}
        </div>
      ))}
      <p className="pt-2 text-[12px] text-muted">Click a step to show only the sessions with that deviation in the table below.</p>
    </div>
  );
}

// ---------- 4 ----------

const SHIFT_IDS: ShiftId[] = ["A", "B", "C"];

/** Heat shade: darker means more. The number is always printed in the cell. */
function heat(n: number, max: number): string {
  if (!n) return "bg-surface-2 text-muted";
  const r = n / max;
  if (r > 0.75) return "bg-blue-ink text-on-strong";
  if (r > 0.5) return "bg-blue text-on-strong";
  if (r > 0.25) return "bg-blue-line text-blue-ink";
  return "bg-blue-soft text-blue-ink";
}

export async function CategoriesBlock({ f }: { f: DashFilter }) {
  const c = await discrepanciesByCategory(await getRepo().conn(), f);
  if (!c.totals.total && !c.fixedOnSpot.total) return <Empty>No discrepancies lodged in this range.</Empty>;
  const shown = f.shift ? [f.shift] : SHIFT_IDS;
  const max = Math.max(...c.rows.flatMap((r) => SHIFT_IDS.map((s) => r[s])), 1);
  const total = (r: Record<ShiftId, number> & { total: number }) => (f.shift ? r[f.shift] : r.total);
  return (
    <>
      <table className="w-full text-[15px]" data-testid="category-table">
        <thead className="text-[13px] text-muted">
          <tr>
            <th className="py-1 text-left font-medium">Category</th>
            {SHIFT_IDS.map((s) => (
              <th key={s} className={cx("w-16 py-1 text-center font-medium", !shown.includes(s) && "opacity-40")}>
                Shift {s}
              </th>
            ))}
            <th className="w-16 py-1 text-center font-medium">{f.shift ? `Total, shift ${f.shift}` : "Total"}</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.category} data-category={r.category}>
              <td className="py-1 pr-2">{r.category}</td>
              {SHIFT_IDS.map((s) => (
                <td key={s} className={cx("px-1 py-1 text-center", !shown.includes(s) && "opacity-40")}>
                  <span className={cx("inline-flex min-w-9 justify-center rounded px-2 py-0.5 font-semibold", heat(r[s], max))} data-shift={s}>
                    {r[s]}
                  </span>
                </td>
              ))}
              <td className="py-1 text-center font-semibold" data-shift="total">{total(r)}</td>
            </tr>
          ))}
          <tr className="border-t border-line font-semibold">
            <td className="py-1.5">All categories</td>
            {SHIFT_IDS.map((s) => (
              <td key={s} className={cx("py-1.5 text-center", !shown.includes(s) && "opacity-40")}>{c.totals[s]}</td>
            ))}
            <td className="py-1.5 text-center">{total(c.totals)}</td>
          </tr>
        </tbody>
      </table>
      <p className="pt-2 text-[14px] text-ink-2" data-testid="fixed-on-spot">
        Fixed on the spot (not lodged): Shift A {c.fixedOnSpot.A} · Shift B {c.fixedOnSpot.B} · Shift C {c.fixedOnSpot.C} · total {c.fixedOnSpot.total}
      </p>
      <p className="pt-1 text-[12px] text-muted">Counted in the shift in which each issue was lodged. Darker means more; the number is in every cell.</p>
    </>
  );
}
