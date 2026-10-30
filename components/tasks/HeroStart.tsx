"use client";
// The Sessions page's start card: Part, Cell and fixture and SOP, pre-filled with the last-used values, and a big
// Start a check that starts it at once. The duplicate rule: the same part and cell already In progress opens that
// check; a task for it still Not started is started instead of a new check. A check in progress on this device is
// finished or left first (Resume it).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reduce } from "@/lib/check/reducer";
import { ENDED_STATUSES } from "@/lib/check/types";
import { getActiveId, readLocal, setActiveId } from "@/lib/client/local";
import { createLocalSession } from "@/lib/client/useCheckSession";
import { sopName } from "@/lib/sop-revisions";

type Match = { kind: "check"; sessionId: string } | { kind: "task"; taskId: string } | null;

const SELECT = "min-h-[56px] w-full rounded-[14px] border border-primary-line bg-surface px-3 pt-5 pb-1.5 text-[17px] font-semibold text-ink";

function deviceCheck(): string | null {
  const id = getActiveId();
  const local = id ? readLocal(id) : null;
  if (!id || !local) return null;
  return ENDED_STATUSES.includes(reduce(local.actions, local.meta.createdAt).status) ? null : id;
}

export function HeroStart({
  operatorName, parts, stations, last, sop, meta,
}: {
  /** "12 steps · 50 check points · takt 45:00" */
  meta: string;
  operatorName: string;
  parts: string[];
  stations: string[];
  last: { part: string; station: string };
  sop: { id: string | null; label: string };
}) {
  const router = useRouter();
  const [part, setPart] = useState(last.part);
  const [station, setStation] = useState(last.station);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; resume?: string } | null>(null);

  const start = async () => {
    setError(null);
    const active = deviceCheck();
    if (active) return setError({ text: "A check is in progress on this device. Finish or leave it first.", resume: active });
    setBusy(true);
    const match = await fetch(`/api/tasks/match?${new URLSearchParams({ part, station })}`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { match: Match }).match : null))
      .catch((): Match => null);
    if (match?.kind === "check") return router.push(`/check/${match.sessionId}`);
    let id: string;
    try {
      id = createLocalSession({ part, sop: sopName(sop.label), fixture: station, station, operator: operatorName, ...(sop.id ? { sopRevisionId: sop.id } : {}) });
    } catch {
      setBusy(false);
      return setError({ text: "This device could not store the new check. Tap Start again." });
    }
    if (match?.kind === "task") {
      const res = await fetch(`/api/tasks/${encodeURIComponent(match.taskId)}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      }).catch(() => null);
      const body = res ? ((await res.json().catch(() => ({}))) as { sessionId?: string }) : {};
      if (res?.status === 409 && body.sessionId) {
        setActiveId(null);
        return router.push(`/check/${body.sessionId}`);
      }
    }
    router.push(`/check/${id}`);
  };

  return (
    <section id="start" className="flex flex-wrap items-center gap-5 rounded-[24px] border border-primary-line bg-primary-soft px-7 py-6" data-testid="hero-start">
      <div className="flex min-w-[260px] flex-1 flex-col gap-1">
        <span className="text-[13px] font-bold tracking-wide text-primary-ink uppercase">Ready for your next check</span>
        <span className="text-[22px] leading-tight font-bold">
          {sopName(sop.label).split(",")[0]} · {part}
        </span>
        <span className="text-[15px] text-ink-2">{meta}</span>
      </div>
      <div className="grid min-w-[560px] flex-[2.2] grid-cols-[1fr_1.3fr_1fr] gap-3">
        <label className="relative">
          <span className="pointer-events-none absolute top-1.5 left-3 text-[12px] text-muted">Part</span>
          <select aria-label="Part" value={part} onChange={(e) => setPart(e.target.value)} className={SELECT}>
            {parts.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="relative">
          <span className="pointer-events-none absolute top-1.5 left-3 text-[12px] text-muted">Cell and fixture</span>
          <select aria-label="Cell and fixture" value={station} onChange={(e) => setStation(e.target.value)} className={SELECT}>
            {stations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="relative">
          <span className="pointer-events-none absolute top-1.5 left-3 text-[12px] text-muted">SOP</span>
          <select aria-label="SOP" value={sop.label} disabled className={SELECT} title="New checks run on the Active SOP revision">
            <option value={sop.label}>{sopName(sop.label)}</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="inline-flex min-h-[64px] items-center gap-2 rounded-[16px] bg-primary px-8 text-[22px] font-bold text-on-strong shadow-card hover:bg-primary-hover disabled:opacity-60"
          data-testid="start-a-check"
        >
          ▶ {busy ? "Starting…" : "Start a check"}
        </button>
        {error && (
          <span role="alert" className="max-w-[320px] text-right text-[14px] text-red-ink">
            {error.text}{" "}
            {error.resume && (
              <a href={`/check/${error.resume}`} className="font-semibold underline">
                Resume it
              </a>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
