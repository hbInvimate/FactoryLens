// Analytics cards shared by the Quality Engineer dashboard and Supervisor Analytics, so both pages always match:
// right first time, where the time goes per step, deviation hotspots, check time by shift, and the discrepancy donut.
// Display only: each page passes its own data.
import Link from "next/link";
import type { ReactNode } from "react";
import { Chip, cx } from "@/components/ds";
import { SHIFTS, type ShiftId } from "@/lib/config";
import { fmtClock } from "@/lib/format";

export const CARD = "flex min-w-0 flex-col gap-4 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card";
export const DONUT = ["var(--fl-primary)", "var(--fl-amber)", "var(--fl-primary-ink)", "var(--fl-primary-border)", "var(--fl-amber-border)", "var(--fl-border-strong)", "var(--fl-text-muted)", "var(--fl-primary-hover)", "var(--fl-text-subtle)"];
export const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const clock = (s: number | null) => (s === null ? "—" : fmtClock(s * 1000));

export function CardHead({ title, sub, right }: { title: string; sub: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-1 flex-col">
        <h2 className="text-[20px] font-semibold">{title}</h2>
        <p className="text-[14px] text-muted">{sub}</p>
      </div>
      {right}
    </div>
  );
}

/** 270° gauge: amber below the goal, green at or above; the goal is a tick on the track. */
function Gauge({ pct, goal }: { pct: number | null; goal: number }) {
  const r = 80;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const a = ((135 + 2.7 * goal) * Math.PI) / 180;
  const [gx, gy] = [100 + Math.cos(a) * r, 100 + Math.sin(a) * r];
  const ok = pct !== null && pct >= goal;
  return (
    <svg viewBox="0 0 200 200" className="w-[200px] flex-none" role="img" aria-label={`Right first time ${pct ?? "—"}%, goal ${goal}%`} data-testid="rft-gauge">
      <circle cx="100" cy="100" r={r} fill="none" stroke="var(--fl-border)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${arc} ${c}`} transform="rotate(135 100 100)" />
      {pct !== null && (
        <circle cx="100" cy="100" r={r} fill="none" stroke={ok ? "var(--fl-primary)" : "var(--fl-amber)"} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${arc * (pct / 100)} ${c}`} transform="rotate(135 100 100)" className="ring-fill" />
      )}
      <line x1={gx + Math.cos(a) * 12} y1={gy + Math.sin(a) * 12} x2={gx - Math.cos(a) * 12} y2={gy - Math.sin(a) * 12} stroke="var(--fl-primary-ink)" strokeWidth="4" strokeLinecap="round" />
      <text x="100" y="104" textAnchor="middle" fontSize="40" fontWeight="800" fill={pct === null ? "var(--fl-text-muted)" : ok ? "var(--fl-primary-ink)" : "var(--fl-amber-ink)"}>
        {pct === null ? "—" : `${pct}%`}
      </text>
      <text x="100" y="128" textAnchor="middle" fontSize="13" fill="var(--fl-text-muted)">
        right first time
      </text>
      <text x="152" y="186" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--fl-primary-ink)">
        goal {goal}%
      </text>
    </svg>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="text-[13px] text-muted">Not enough checks for a trend yet.</p>;
  const w = 420;
  const h = 48;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden data-testid="rft-spark">
      <polyline points={pts} fill="none" stroke="var(--fl-primary)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Row({ label, sub, n, of, tone, testId }: { label: string; sub: string; n: number; of: number; tone: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="flex items-baseline gap-2 text-[15px]">
        <i className={cx("inline-block size-2.5 rounded-sm", tone)} />
        <b>{label}</b>
        <span className="flex-1 text-[13px] text-muted">{sub}</span>
        <b className="tabular-nums">{n}</b>
      </div>
      <span className="h-2 rounded-full bg-surface-2">
        <span className={cx("bar-grow block h-full rounded-full", tone)} style={{ width: `${pctOf(n, of)}%` }} />
      </span>
    </div>
  );
}

export interface Rft {
  completed: number;
  right: number;
  redone: number;
  redoneSteps: number[];
  left: number;
  runningRate: number[];
}

export function RftCard({ rft, goal, sub }: { rft: Rft; goal: number; sub: string }) {
  const rate = rft.completed ? pctOf(rft.right, rft.completed) : null;
  const below = rate !== null && rate < goal;
  const last = rft.runningRate.slice(-3);
  const trend = rft.runningRate.length < 2 ? "" : rft.runningRate[rft.runningRate.length - 1] >= rft.runningRate[0] ? "rising" : "falling";
  return (
    <section className={CARD} data-testid="rft-card">
      <CardHead title="Right first time" sub={sub} right={rate !== null && <Chip tone={below ? "amber" : "green"} size="sm">{below ? "Below goal" : "On goal"}</Chip>} />
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col items-center">
          <Gauge pct={rate} goal={goal} />
          {rate !== null && <span className={cx("text-[14px] font-semibold", below ? "text-amber-ink" : "text-primary-ink")}>{below ? `${goal - rate} pts below goal` : "On goal"}</span>}
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-3">
          <Row label="Right first time" sub={`of ${rft.completed} completed`} n={rft.right} of={rft.completed} tone="bg-primary" testId="rft-right" />
          <Row label="Redone" sub={rft.redoneSteps.length ? `steps ${rft.redoneSteps.join(", ")}` : "none"} n={rft.redone} of={rft.completed} tone="bg-amber" testId="rft-redone" />
          <Row label="Left" sub="not scored" n={rft.left} of={Math.max(rft.completed, rft.left)} tone="bg-line-strong" testId="rft-left" />
          <div className="flex items-baseline justify-between border-t border-line pt-2 text-[13px] text-muted">
            <span>Running rate, check by check</span>
            {trend && (
              <b className={trend === "rising" ? "text-primary-ink" : "text-amber-ink"}>
                {trend === "rising" ? "▲ rising" : "▼ falling"}
                {last.length === 3 && last.every((v, i) => i === 0 || v >= last[i - 1]) ? " · last 3 holding" : ""}
              </b>
            )}
          </div>
          <Spark values={rft.runningRate} />
        </div>
      </div>
    </section>
  );
}

/** One row per step: the bar is the median as a share of the step target, green at or under it, amber over. */
export function StepTimesCard({
  steps, medianCycleSeconds, taktSeconds, stepHref,
}: {
  steps: { step: number; name: string; medianSeconds: number | null; targetSeconds: number | null }[];
  medianCycleSeconds: number | null;
  taktSeconds: number | null;
  stepHref?: (step: number) => string;
}) {
  const none = !steps.some((s) => s.medianSeconds !== null);
  return (
    <section className={CARD} data-testid="step-times">
      <CardHead
        title="Where the time goes · per step"
        sub="Median time per step against its target, completed checks"
        right={
          <div className="flex flex-col items-end">
            <span className="text-[34px] leading-none font-bold tabular-nums">{clock(medianCycleSeconds)}</span>
            <span className="text-[13px] text-muted">median cycle · takt {clock(taktSeconds)}</span>
          </div>
        }
      />
      {none && <p className="text-[15px] text-muted">No completed checks with step times yet.</p>}
      <ol className="flex flex-col gap-1.5">
        {steps.map((s) => {
          const over = s.medianSeconds !== null && s.targetSeconds !== null && s.medianSeconds > s.targetSeconds;
          const share = s.medianSeconds === null ? 0 : s.targetSeconds ? Math.min(1, s.medianSeconds / s.targetSeconds) : 1;
          const name = `${s.step}. ${s.name}`;
          return (
            <li key={s.step} data-step={s.step} className="grid grid-cols-[minmax(0,210px)_1fr_auto] items-center gap-3 text-[14px]">
              {stepHref ? (
                <Link href={stepHref(s.step)} className="truncate hover:text-primary-ink" title={name}>
                  <b className="tabular-nums text-muted">{s.step}</b> {s.name}
                </Link>
              ) : (
                <span className="truncate" title={name}>
                  <b className="tabular-nums text-muted">{s.step}</b> {s.name}
                </span>
              )}
              <span className="h-2.5 rounded-full bg-surface-2">
                {s.medianSeconds !== null && <span className={cx("bar-grow block h-full rounded-full", over ? "bg-amber" : "bg-primary")} style={{ width: `${Math.max(3, share * 100)}%` }} />}
              </span>
              <span className={cx("min-w-[96px] text-right tabular-nums", over ? "font-semibold text-amber-ink" : "text-ink-2")}>
                {clock(s.medianSeconds)} <span className="text-muted">/ {clock(s.targetSeconds)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export interface Hotspot {
  step: number;
  name: string;
  total: number;
  /** The exact point or kind, with a count: "C6 not closed ×4", "skipped ×1". */
  tags: { key: string; label: string; href?: string }[];
  href?: string;
}

/** Twelve step tiles, then the top three steps with their exact points. */
export function HotspotsCard({ byStep, top, sub, testId = "top-deviations" }: { byStep: { step: number; total: number }[]; top: Hotspot[]; sub: string; testId?: string }) {
  const devTotal = byStep.reduce((s, d) => s + d.total, 0);
  const maxStep = Math.max(1, ...byStep.map((d) => d.total));
  return (
    <section className={CARD} data-testid={testId}>
      <CardHead
        title="Deviation hotspots"
        sub={sub}
        right={
          <div className="flex flex-col items-end">
            <span className={cx("text-[34px] leading-none font-bold", devTotal ? "text-amber-ink" : "text-primary-ink")} data-testid="deviation-total">
              {devTotal}
            </span>
            <span className="text-[13px] text-muted">deviations</span>
          </div>
        }
      />
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12" data-testid="step-tiles">
        {byStep.map((d) => (
          <span
            key={d.step}
            data-step={d.step}
            className={cx("flex flex-col items-center rounded-[10px] py-1.5 text-[12px] font-semibold", d.total === 0 ? "bg-surface-2 text-subtle" : d.total / maxStep > 0.5 ? "bg-amber text-on-amber" : "bg-amber-soft text-amber-ink")}
          >
            Step {d.step}
            <b className="text-[18px]">{d.total || "·"}</b>
          </span>
        ))}
      </div>
      {top.length === 0 ? (
        <p className="py-6 text-center text-[17px] text-muted">No deviations in this period.</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="deviation-rows">
          {top.map((d, i) => (
            <li key={d.step} className="flex items-center gap-3 rounded-[14px] bg-surface-2 px-4 py-3" data-row={d.step}>
              <span className="flex size-7 flex-none items-center justify-center rounded-[8px] bg-amber-soft text-[14px] font-bold text-amber-ink">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {d.href ? (
                  <Link href={d.href} scroll={false} className="truncate text-[15px] font-bold hover:text-primary-ink" title="Show only sessions with this deviation">
                    Step {d.step} · {d.name}
                  </Link>
                ) : (
                  <b className="truncate text-[15px]">
                    Step {d.step} · {d.name}
                  </b>
                )}
                <span className="flex flex-wrap gap-1.5">
                  {d.tags.map((k) =>
                    k.href ? (
                      <Link key={k.key} href={k.href} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] hover:border-primary" data-tag={k.key}>
                        {k.label}
                      </Link>
                    ) : (
                      <span key={k.key} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px]" data-tag={k.key}>
                        {k.label}
                      </span>
                    ),
                  )}
                </span>
              </span>
              <b className="text-[20px] tabular-nums" data-testid="hotspot-count">{d.total}</b>
              <span className="w-12 text-right text-[14px] text-muted">{pctOf(d.total, devTotal)}%</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export interface ShiftTime {
  shift: ShiftId;
  average: number | null;
  median: number | null;
  count: number;
}

/** One row per shift: the bar is the average check time as a share of takt, green under it, amber over. */
export function ShiftTimesCard({ shifts, taktSeconds, active }: { shifts: ShiftTime[]; taktSeconds: number | null; active: ShiftId | null }) {
  const timed = shifts.filter((s) => s.average !== null);
  const under = taktSeconds !== null && timed.length > 0 && timed.every((s) => (s.average as number) <= taktSeconds);
  const max = taktSeconds ?? Math.max(1, ...timed.map((s) => s.average as number));
  return (
    <section className={CARD} data-testid="block-shifts">
      <CardHead
        title="Check time by shift"
        sub={`Active time of completed checks, against takt ${clock(taktSeconds)}`}
        right={under && <Chip tone="green" size="sm">All shifts under takt</Chip>}
      />
      <div className="flex flex-col gap-4">
        {shifts.map((s) => {
          const def = SHIFTS.find((x) => x.id === s.shift)!;
          const over = s.average !== null && taktSeconds !== null && s.average > taktSeconds;
          return (
            <div key={s.shift} data-shift={s.shift} className={cx("grid grid-cols-[120px_1fr_auto] items-center gap-3", active !== null && active !== s.shift && "opacity-40")}>
              <span className="flex flex-col leading-tight">
                <b className="text-[15px]">Shift {s.shift}</b>
                <span className="text-[13px] text-muted">
                  {def.start}–{def.end}
                </span>
              </span>
              <span className="h-3 rounded-full bg-surface-2">
                {s.average !== null && <span className={cx("bar-grow block h-full rounded-full", over ? "bg-amber" : "bg-primary")} style={{ width: `${Math.max(3, Math.min(1, s.average / max) * 100)}%` }} />}
              </span>
              <span className="flex min-w-[200px] items-center justify-end gap-2 text-[14px]">
                {s.average === null ? (
                  <span className="text-muted">no checks</span>
                ) : (
                  <>
                    <span className="tabular-nums">
                      <b data-testid="shift-average">{clock(s.average)}</b> <span className="text-muted" data-testid="shift-median">· median {clock(s.median)}</span>
                    </span>
                    <Chip tone="gray" size="sm">
                      {s.count} {s.count === 1 ? "check" : "checks"}
                    </Chip>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Donut by category with the total in the middle. */
export function Donut({ parts, total, label = "lodged" }: { parts: { label: string; count: number }[]; total: number; label?: string }) {
  const C = 2 * Math.PI * 60;
  const lens = parts.map((p) => (total ? (p.count / total) * C : 0));
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((x, y) => x + y, 0));
  return (
    <svg viewBox="0 0 160 160" className="w-[170px] flex-none" role="img" aria-label={`${total} discrepancies ${label}`}>
      <circle cx="80" cy="80" r="60" fill="none" stroke="var(--fl-surface-2)" strokeWidth="26" />
      {parts.map((p, i) => (
        <circle key={p.label} cx="80" cy="80" r="60" fill="none" stroke={DONUT[i % DONUT.length]} strokeWidth="26" strokeDasharray={`${lens[i]} ${C}`} strokeDashoffset={-starts[i]} transform="rotate(-90 80 80)" className="ring-fill" />
      ))}
      <text x="80" y="84" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--fl-text)">
        {total}
      </text>
      <text x="80" y="104" textAnchor="middle" fontSize="12" fill="var(--fl-text-muted)">
        {label}
      </text>
    </svg>
  );
}
