"use client";
// "All values in a line": one row per check, one column per point of the chosen group. The left columns and the
// header stay put while the values scroll. Each value is coloured against the SOP tolerance; a dot marks a corrected
// value, "D" a demo value. A sparkline per point shows its trend, oldest to newest. Clicking a value opens that
// point's history and the session video at that moment.
import Link from "next/link";
import { useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { cx } from "@/components/ui";
import { MEASUREMENT_UNIT } from "@/lib/config";
import { judge, toleranceOf, type Judgement, type Series } from "@/lib/measure-judge";
import type { WideRow } from "@/lib/server/measurements";

const FIXED = [
  { label: "Date", w: 130 },
  { label: "Quality Technician", w: 150 },
  { label: "Station", w: 140 },
  { label: "Status", w: 112 },
  { label: "Session", w: 76 },
];
const LEFT = FIXED.map((_, i) => FIXED.slice(0, i).reduce((a, c) => a + c.w, 0));
const SPARK_H = 30;

const stick = "sticky z-10 bg-surface";
const th = "border-b border-line px-3 text-left text-[13px] font-semibold text-muted";
const PILL: Record<Judgement, string> = {
  in: "bg-primary-soft text-primary-ink",
  near: "bg-amber-soft text-amber-ink",
  out: "bg-red-soft text-red-ink",
};
const STATUS_LABEL: Record<string, string> = { complete: "Complete", left: "Left", running: "In progress", paused: "Paused", on_hold: "On hold" };

/** A small trend line: red when the latest value is out of tolerance. */
function Spark({ point, series, w = 44, h = 16 }: { point: string; series: Series; w?: number; h?: number }) {
  if (series.length < 2) return <span className="block" style={{ height: h }} />;
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(" ");
  const out = judge(point, vals[vals.length - 1]) === "out";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden data-out={out || undefined} className="mx-auto block">
      <polyline points={pts} fill="none" stroke={out ? "var(--fl-red)" : "var(--fl-primary)"} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export interface DriftBanner {
  point: string;
  text: string;
}

export function WideTable({ rows, points, banner }: { rows: WideRow[]; points: readonly string[]; banner: DriftBanner | null }) {
  const [open, setOpen] = useState<{ point: string; at?: string; sessionId?: string } | null>(null);
  // Oldest first, per point.
  const series = (p: string): Series =>
    [...rows]
      .reverse()
      .flatMap((r) => (r.cells[p] ? [{ value: r.cells[p].latest, at: r.cells[p].at, sessionId: r.sessionId }] : []));

  return (
    <>
      {banner && (
        <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-primary-line bg-primary-soft px-5 py-4" data-testid="ai-banner">
          <span className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-[15px] font-bold text-on-strong">AI</span>
          <p className="min-w-0 flex-1 text-[16px] text-ink">{banner.text}</p>
          <button
            type="button"
            onClick={() => setOpen({ point: banner.point })}
            className="tap rounded-[var(--fl-radius-md)] bg-primary px-5 text-[15px] font-semibold text-on-strong hover:bg-primary-hover"
          >
            Open {banner.point} history
          </button>
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-[20px] border border-line bg-surface" data-testid="wide-scroll">
        <table className="border-separate border-spacing-0 text-[14px]" data-testid="wide-table">
          <thead>
            <tr>
              {FIXED.map((c, i) => (
                <th key={c.label} className={cx(th, stick, "top-0 z-30 bg-surface-2 pb-2 align-bottom")} style={{ left: LEFT[i], minWidth: c.w, maxWidth: c.w }}>
                  {c.label}
                </th>
              ))}
              {points.map((p, i) => (
                <th key={p} className={cx(th, "sticky top-0 z-20 bg-surface-2 pt-2 pb-2 text-center", i === 0 && "border-l")} style={{ minWidth: 64 }}>
                  <span style={{ height: SPARK_H }} className="flex items-center" data-testid={`spark-${p}`}>
                    <Spark point={p} series={series(p)} />
                  </span>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sessionId} data-session={r.sessionId} className="hover:bg-surface-2">
                <td className={cx(stick, "border-b border-line px-3 py-2 align-top")} style={{ left: LEFT[0], minWidth: FIXED[0].w, maxWidth: FIXED[0].w }}>
                  <span className="flex flex-col leading-tight">
                    <b className="text-[14px]">
                      <LocalTime iso={r.startedAt} dateOnly />
                    </b>
                    <span className="text-[13px] text-muted">
                      <LocalTime iso={r.startedAt} timeOnly />
                    </span>
                  </span>
                </td>
                <td className={cx(stick, "border-b border-line px-3 py-2 align-top break-words")} style={{ left: LEFT[1], minWidth: FIXED[1].w, maxWidth: FIXED[1].w }}>
                  {r.technician}
                </td>
                <td className={cx(stick, "border-b border-line px-3 py-2 align-top break-words")} style={{ left: LEFT[2], minWidth: FIXED[2].w, maxWidth: FIXED[2].w }}>
                  {r.station}
                </td>
                <td className={cx(stick, "border-b border-line px-3 py-2 align-top")} style={{ left: LEFT[3], minWidth: FIXED[3].w, maxWidth: FIXED[3].w }}>
                  <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold", r.status === "complete" ? "bg-primary-soft text-primary-ink" : "bg-surface-2 text-ink-2")} data-testid="status-pill">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className={cx(stick, "border-b border-r border-line px-3 py-2 align-top")} style={{ left: LEFT[4], minWidth: FIXED[4].w, maxWidth: FIXED[4].w }}>
                  <Link href={`/dashboard/${r.sessionId}`} className="font-semibold text-primary-ink underline-offset-4 hover:underline">
                    View
                  </Link>
                </td>
                {points.map((p, i) => {
                  const c = r.cells[p];
                  const corrected = !!c && c.earlier.length > 0;
                  const j = c ? judge(p, c.latest) : null;
                  return (
                    <td key={p} data-point={p} data-corrected={corrected ? "1" : undefined} data-judge={j ?? undefined} className={cx("border-b border-line px-1.5 py-1.5 text-center", i === 0 && "border-l")}>
                      {c ? (
                        <button
                          type="button"
                          onClick={() => setOpen({ point: p, at: c.at, sessionId: r.sessionId })}
                          title={corrected ? `Corrected. Earlier: ${c.earlier.join(", ")} ${MEASUREMENT_UNIT}` : r.demo || c.demo ? "Demo value, not a measurement" : `${p} history`}
                          className={cx("inline-flex min-w-[52px] items-center justify-center rounded-[8px] px-2 py-1 font-semibold tabular-nums whitespace-nowrap hover:ring-2 hover:ring-primary-line", j ? PILL[j] : "bg-surface-2")}
                        >
                          {c.latest}
                          {corrected && <span aria-label="corrected" className="ml-0.5 inline-block size-1.5 rounded-full bg-amber align-top" data-testid="corrected-dot" />}
                          {(r.demo || c.demo) && (
                            <sup aria-label="demo value" className="ml-0.5 text-[10px] font-bold text-amber-ink">
                              D
                            </sup>
                          )}
                        </button>
                      ) : (
                        <span className="text-subtle">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-primary-soft ring-1 ring-primary-line" />In tolerance</span>
        <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-amber-soft ring-1 ring-amber-line" />Near the limit</span>
        <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-red-soft ring-1 ring-red-line" />Out of tolerance</span>
        <span>· The latest value of each point; a dot marks a corrected value, D a demo value. Click a value to see that point&apos;s history and the video at that moment.</span>
      </p>

      {open && <History point={open.point} at={open.at} sessionId={open.sessionId} series={series(open.point)} onClose={() => setOpen(null)} />}
    </>
  );
}

function History({ point, at, sessionId, series, onClose }: { point: string; at?: string; sessionId?: string; series: Series; onClose: () => void }) {
  const t = toleranceOf(point);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${point} history`} onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-[760px] flex-col gap-4 overflow-y-auto rounded-[22px] bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-[24px] font-bold">{point} history</h2>
          {t && (
            <span className="text-[14px] text-muted">
              {t.nominal.toFixed(2)} ± {t.tol} {MEASUREMENT_UNIT}
            </span>
          )}
          <button type="button" onClick={onClose} className="tap rounded-[var(--fl-radius-md)] border border-line-strong px-4 text-[15px] font-semibold">
            Close
          </button>
        </div>
        <Spark point={point} series={series} w={680} h={80} />
        {at && (
          <div className="flex aspect-[16/6] items-center justify-center rounded-[16px] border border-line bg-surface-2 text-center text-[15px] text-ink-2" data-testid="history-video">
            Session video at <LocalTime iso={at} timeOnly />: Not recorded yet
          </div>
        )}
        <ol className="flex flex-col divide-y divide-line" data-testid="history-list">
          {[...series].reverse().map((s) => {
            const j = judge(point, s.value);
            return (
              <li key={s.sessionId} className={cx("flex items-center gap-3 py-2 text-[15px]", s.sessionId === sessionId && "font-semibold")}>
                <span className="flex-1">
                  <LocalTime iso={s.at} />
                </span>
                <span className={cx("rounded-[8px] px-2 py-0.5 tabular-nums", j ? PILL[j] : "bg-surface-2")}>
                  {s.value} {MEASUREMENT_UNIT}
                </span>
                <Link href={`/dashboard/${s.sessionId}`} className="text-primary-ink hover:underline">
                  View
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
