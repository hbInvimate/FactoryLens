// Analytics charts: plain SVG and HTML, drawn on the server, theme colours only (var(--fl-...) in SVG).
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, cx } from "@/components/ds";
import { minutes } from "./parts";

/** A chart card of the 2×2 grid. Without data it says so instead of leaving blank space. */
export function ChartCard({ title, sub, testId, empty, children }: { title: string; sub: string; testId: string; empty: boolean; children: ReactNode }) {
  return (
    <Card className="flex min-h-[300px] flex-col gap-1 px-5 py-4" testId={testId}>
      <h2 className="text-[19px] font-semibold">{title}</h2>
      <p className="text-[14px] text-muted">{sub}</p>
      {empty ? <p className="flex flex-1 items-center justify-center text-[17px] text-muted" data-empty>No data yet</p> : <div className="flex flex-1 flex-col justify-center">{children}</div>}
    </Card>
  );
}

const W = 520;
const H = 200;
const PAD = { l: 44, r: 8, t: 22, b: 30 };

/** First-time right per week: a line with dots; a week without checks breaks the line and says "no checks". */
export function FtrLine({ weeks }: { weeks: { start: string; label: string; completed: number; ftrPct: number | null }[] }) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (iw / weeks.length) * (i + 0.5);
  const y = (p: number) => PAD.t + ih - (p / 100) * ih;
  // Runs of consecutive weeks with checks; a gap between runs.
  const runs: number[][] = [];
  weeks.forEach((w, i) => {
    if (w.ftrPct === null) return;
    const last = runs.at(-1);
    if (last && last.at(-1) === i - 1) last.push(i);
    else runs.push([i]);
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="First-time right per week">
      {[0, 50, 100].map((p) => (
        <g key={p}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(p)} y2={y(p)} stroke="var(--fl-border)" />
          <text x={PAD.l - 8} y={y(p) + 4} textAnchor="end" fontSize="13" fill="var(--fl-text-muted)">
            {p}%
          </text>
        </g>
      ))}
      {runs.map((r) => (
        <polyline key={r[0]} points={r.map((i) => `${x(i)},${y(weeks[i].ftrPct as number)}`).join(" ")} fill="none" stroke="var(--fl-primary)" strokeWidth="3" strokeLinejoin="round" />
      ))}
      {weeks.map((w, i) => (
        <g key={w.start} data-week={w.start}>
          {w.ftrPct === null ? (
            <text x={x(i)} y={y(0) - 22} textAnchor="middle" fontSize="12" fill="var(--fl-text-muted)">
              <tspan x={x(i)}>no</tspan>
              <tspan x={x(i)} dy="14">checks</tspan>
            </text>
          ) : (
            <>
              <circle cx={x(i)} cy={y(w.ftrPct)} r="5" fill="var(--fl-primary)" stroke="var(--fl-surface)" strokeWidth="2">
                <title>{`Week of ${w.label}: ${w.ftrPct}% first-time right, ${w.completed} completed checks`}</title>
              </circle>
              <text x={x(i)} y={y(w.ftrPct) - 10} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--fl-text)">
                {w.ftrPct}%
              </text>
            </>
          )}
          <text x={x(i)} y={H - PAD.b + 20} textAnchor="middle" fontSize="13" fill="var(--fl-text-muted)">
            {w.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Average time per step: a bar per step, a dark target tick on each; amber when over the target. Each bar is a link. */
export function StepBars({ steps }: { steps: { step: number; name: string; avgSeconds: number | null; targetSeconds: number | null; href: string }[] }) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const max = Math.max(1, ...steps.map((s) => Math.max(s.avgSeconds ?? 0, s.targetSeconds ?? 0))) * 1.1;
  const slot = iw / steps.length;
  const bw = Math.min(30, slot * 0.6);
  const y = (sec: number) => PAD.t + ih - (sec / max) * ih;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Average time per step against the target">
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--fl-border-strong)" />
      <text x={PAD.l - 8} y={y(0) + 4} textAnchor="end" fontSize="13" fill="var(--fl-text-muted)">
        0:00
      </text>
      <text x={PAD.l - 8} y={PAD.t + 4} textAnchor="end" fontSize="13" fill="var(--fl-text-muted)">
        {minutes(Math.round(max))}
      </text>
      {steps.map((s, i) => {
        const cx0 = PAD.l + slot * i + slot / 2;
        const over = s.avgSeconds !== null && s.targetSeconds !== null && s.avgSeconds > s.targetSeconds;
        const tip = `${s.step}. ${s.name}: average ${minutes(s.avgSeconds)}, target ${s.targetSeconds === null ? "none" : minutes(s.targetSeconds)}`;
        return (
          <Link key={s.step} href={s.href} aria-label={tip} data-step={s.step} data-over={over || undefined}>
            <title>{tip}</title>
            <rect x={cx0 - slot / 2} y={PAD.t} width={slot} height={ih + PAD.b} fill="transparent" />
            {s.avgSeconds !== null && <rect x={cx0 - bw / 2} y={y(s.avgSeconds)} width={bw} height={y(0) - y(s.avgSeconds)} rx="3" fill={over ? "var(--fl-amber)" : "var(--fl-primary)"} />}
            {s.targetSeconds !== null && <line x1={cx0 - bw / 2 - 4} x2={cx0 + bw / 2 + 4} y1={y(s.targetSeconds)} y2={y(s.targetSeconds)} stroke="var(--fl-text)" strokeWidth="3" />}
            <text x={cx0} y={H - PAD.b + 20} textAnchor="middle" fontSize="13" fill="var(--fl-text-2)">
              {s.step}
            </text>
          </Link>
        );
      })}
    </svg>
  );
}

/** Horizontal bars with counts; each row is a link (56 px tall). */
export function CountBars({ rows, tone, testId }: { rows: { key: string; label: string; count: number; href: string }[]; tone: "amber" | "red"; testId: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ol className="flex flex-col" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="grid min-h-[56px] grid-cols-[minmax(0,180px)_1fr_48px] items-center gap-3 rounded-[8px] px-2 hover:bg-surface-2" data-row={r.key}>
            <span className="truncate text-[15px]" title={r.label}>
              {r.label}
            </span>
            <span className="h-5 rounded-full bg-surface-2">
              <span className={cx("block h-full rounded-full", tone === "amber" ? "bg-amber" : "bg-red")} style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <b className="text-right text-[16px]">{r.count}</b>
          </Link>
        </li>
      ))}
    </ol>
  );
}
