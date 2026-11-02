"use client";
// Point health (one tile per point: trend, tolerance band, latest value) and the selected point's control chart, for
// the last 7, 25, 50, 100 or all readings. The point and the count go in the URL, so the Export menu uses them.
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";
import { MEASUREMENT_UNIT, PLANT_TIME_ZONE } from "@/lib/config";
import { DEFAULT_READINGS, READINGS, chartStats, fmt3, fmtCpk, lastReadings, parseReadings, type Readings } from "@/lib/measure-chart";
import { drift, judge, toleranceOf, type Judgement, type Series } from "@/lib/measure-judge";
import type { WideRow } from "@/lib/server/measurements";

const TONE: Record<Judgement, string> = { in: "var(--fl-primary)", near: "var(--fl-amber)", out: "var(--fl-red)" };
const TEXT: Record<Judgement, string> = { in: "text-primary-ink", near: "text-amber-ink", out: "text-red-ink" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: PLANT_TIME_ZONE });

function TileSpark({ point, series }: { point: string; series: Series }) {
  const w = 72;
  const h = 26;
  const t = toleranceOf(point);
  if (series.length < 2) return <span className="block" style={{ height: h }} />;
  const vals = series.map((s) => s.value);
  const lo = Math.min(...vals, t ? t.nominal - t.tol : Infinity);
  const hi = Math.max(...vals, t ? t.nominal + t.tol : -Infinity);
  const y = (v: number) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${y(v)}`).join(" ");
  const j = judge(point, vals[vals.length - 1]) ?? "in";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {t && <rect x="0" width={w} y={y(t.nominal + t.tol)} height={y(t.nominal - t.tol) - y(t.nominal + t.tol)} fill="var(--fl-primary-soft)" />}
      <polyline points={pts} fill="none" stroke={TONE[j]} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Chart({ point, series }: { point: string; series: Series }) {
  const W = 760;
  const H = 260;
  const L = 44;
  const R = 44;
  const T = 16;
  const B = 28;
  const t = toleranceOf(point);
  const vals = series.map((s) => s.value);
  const pad = t ? t.tol * 0.6 : 0.05;
  const lo = Math.min(...vals, t ? t.nominal - t.tol - pad : Infinity);
  const hi = Math.max(...vals, t ? t.nominal + t.tol + pad : -Infinity);
  const x = (i: number) => (series.length <= 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (series.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  const many = series.length > 25;
  const ticks = Math.max(1, Math.ceil(series.length / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${point} control chart, ${series.length} readings`} data-testid="control-chart">
      {t && (
        <>
          <rect x={L} width={W - L - R} y={y(t.nominal + t.tol)} height={y(t.nominal - t.tol) - y(t.nominal + t.tol)} fill="var(--fl-primary-soft)" />
          {[
            [t.nominal + t.tol, "USL", "var(--fl-red)", "5 4"],
            [t.nominal, "NOM", "var(--fl-primary)", ""],
            [t.nominal - t.tol, "LSL", "var(--fl-red)", "5 4"],
          ].map(([v, label, c, dash]) => (
            <g key={label as string}>
              <line x1={L} x2={W - R} y1={y(v as number)} y2={y(v as number)} stroke={c as string} strokeDasharray={dash as string} strokeWidth="1.2" />
              <text x={L - 6} y={y(v as number) + 3} fontSize="10" textAnchor="end" fill="var(--fl-text-muted)">
                {(v as number).toFixed(2)}
              </text>
              <text x={W - R + 6} y={y(v as number) + 3} fontSize="10" fontWeight="700" fill={c as string}>
                {label as string}
              </text>
            </g>
          ))}
        </>
      )}
      <polyline points={series.map((s, i) => `${x(i)},${y(s.value)}`).join(" ")} fill="none" stroke="var(--fl-text-muted)" strokeWidth="1.5" strokeLinejoin="round" />
      {series.map((s, i) => {
        const j = judge(point, s.value) ?? "in";
        const last = i === series.length - 1;
        const label = !many || last || j === "out";
        return (
          <g key={s.sessionId + i}>
            <circle cx={x(i)} cy={y(s.value)} r={many ? (j === "in" ? 2.2 : 3.2) : 5} fill="var(--fl-surface)" stroke={TONE[j]} strokeWidth={many ? 1.5 : 2}>
              <title>{`${new Date(s.at).toLocaleString("en-US", { timeZone: PLANT_TIME_ZONE })}: ${s.value} ${MEASUREMENT_UNIT}`}</title>
            </circle>
            {label && (
              <text x={x(i)} y={y(s.value) + (j === "out" || s.value < (t?.nominal ?? 0) ? 16 : -9)} fontSize="10" fontWeight="700" textAnchor="middle" fill={TONE[j]}>
                {s.value.toFixed(2)}
              </text>
            )}
            {(i % ticks === 0 || last) && (
              <text x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--fl-text-muted)">
                {day(s.at)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function ControlChart({ rows, points, initialPoint }: { rows: WideRow[]; points: readonly string[]; initialPoint: string }) {
  const sp = useSearchParams();
  const [point, setPoint] = useState(sp.get("point") && points.includes(sp.get("point") as string) ? (sp.get("point") as string) : initialPoint);
  const [n, setN] = useState<Readings>(parseReadings(sp.get("n") ?? DEFAULT_READINGS));
  // Keep the choice in the URL (no navigation), so the Export menu exports the same point and readings.
  const remember = (p: string, k: Readings) => {
    const q = new URLSearchParams(window.location.search);
    q.set("point", p);
    q.set("n", k);
    window.history.replaceState(null, "", `?${q}`);
  };
  // Oldest first, per point.
  const series = (p: string): Series =>
    lastReadings(
      [...rows].reverse().flatMap((r) => (r.cells[p] ? [{ value: r.cells[p].latest, at: r.cells[p].at, sessionId: r.sessionId }] : [])),
      n,
    );
  const s = series(point);
  const st = chartStats(point, s.map((x) => x.value));
  const d = drift(s);
  const latest = s.length ? judge(point, s[s.length - 1].value) : null;

  return (
    <div className="grid items-stretch gap-4 xl:grid-cols-[1fr_1.15fr]" data-testid="control-chart-card">
      <section className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card" data-testid="point-health">
        <div>
          <h2 className="text-[20px] font-semibold">Point health</h2>
          <p className="text-[14px] text-muted">Each tile: trend over the selected readings · band = tolerance · latest value</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 2xl:grid-cols-7">
          {points.map((p) => {
            const ps = series(p);
            const v = ps.length ? ps[ps.length - 1].value : null;
            const j = v === null ? null : judge(p, v);
            return (
              <button
                key={p}
                type="button"
                data-point={p}
                aria-pressed={p === point}
                onClick={() => {
                  setPoint(p);
                  remember(p, n);
                }}
                className={cx("flex flex-col items-start gap-0.5 rounded-[12px] border px-2.5 py-2 text-left hover:border-primary", p === point ? "border-2 border-primary bg-primary-soft" : "border-line bg-surface")}
              >
                <span className="flex w-full items-center justify-between text-[13px] font-semibold">
                  {p}
                  {j && <i className="inline-block size-2 rounded-full" style={{ background: TONE[j] }} />}
                </span>
                <TileSpark point={p} series={ps} />
                <b className={cx("text-[15px] tabular-nums", j ? TEXT[j] : "text-muted")}>{v === null ? "—" : v.toFixed(2)}</b>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-1 flex-col">
            <h2 className="text-[20px] font-semibold">{point} · control chart</h2>
            <p className="text-[14px] text-muted">Readings against the tolerance band · click a tile to switch point</p>
          </div>
          {latest && latest !== "in" && (
            <span className={cx("rounded-full px-3 py-1 text-[13px] font-semibold", latest === "out" ? "bg-red-soft text-red-ink" : "bg-amber-soft text-amber-ink")}>
              {latest === "out" ? "Out of tolerance" : "Near the limit"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Readings" data-testid="readings-picker">
          <span className="text-[13px] text-muted">Readings</span>
          {READINGS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === n}
              onClick={() => {
                setN(k);
                remember(point, k);
              }}
              className={cx("min-h-[36px] rounded-full border px-3.5 text-[14px] font-semibold", k === n ? "border-primary bg-primary text-on-strong" : "border-line bg-surface text-ink-2 hover:border-primary")}
            >
              {k === "all" ? "All" : `Last ${k}`}
            </button>
          ))}
        </div>
        {d && (
          <p className={cx("text-[14px] font-semibold", latest === "out" ? "text-red-ink" : "text-amber-ink")} data-testid="drift-note">
            Drifting {d.dir} {d.n} checks in a row: {d.from} to {d.to} {MEASUREMENT_UNIT}
          </p>
        )}
        {s.length === 0 ? <p className="py-8 text-center text-[15px] text-muted">No readings for {point} yet.</p> : <Chart point={point} series={s} />}
        <dl className="grid grid-cols-5 gap-2 rounded-[14px] bg-surface-2 px-4 py-2.5 text-[14px]" data-testid="chart-stats">
          {[
            ["n", String(st.n)],
            ["Mean", fmt3(st.mean)],
            ["Min", fmt3(st.min)],
            ["Max", fmt3(st.max)],
            ["Cpk", fmtCpk(st.cpk)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-[12px] text-muted">{k}</dt>
              <dd className={cx("font-bold tabular-nums", k === "Cpk" && st.cpk !== null && (st.cpk < 1 ? "text-red-ink" : st.cpk < 1.33 ? "text-amber-ink" : "text-primary-ink"))} data-testid={`stat-${k.toLowerCase()}`}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
