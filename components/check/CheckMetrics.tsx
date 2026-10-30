"use client";
// The check screen's six metric cards (2 rows of 3): Steps done, Check points, Cycle time, Deviations, Conformance
// and Phase. Display only, from the check's own state. Rings, bars and squares animate (600 ms); numbers count up;
// the timers do not. prefers-reduced-motion: no animation (globals.css).
import { CountUp } from "@/components/ds/CountUp";
import { activeBetween, checkPointsDone, conformanceSoFar, elapsedMs, isRightFirstTime, stepActiveMs, stepsDone } from "@/lib/check/reducer";
import { deviationText } from "@/lib/check/text";
import type { CheckState } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import { useSopRevision, useSopStep } from "@/lib/client/sopContext";
import { STEPS, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { checkTargetSeconds } from "@/lib/sop-revisions";
import { cx } from "../ui";
import { confTone } from "@/lib/conformance-tone";

const CARD = "flex min-w-0 flex-col gap-2 rounded-[20px] border border-line bg-surface px-5 py-4 shadow-card";
const LABEL = "text-[16px] text-muted";
/** The SOP's phases, in order. */
const PHASES = [...new Set(STEPS.map((s) => s.phase))];

/** A ring (128 px, 12 px stroke, round ends by default) with "X/Y" inside. */
export function BigRing({ value, of, testId, size = 128, label }: { value: number; of: number; testId?: string; size?: number; label?: string }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex flex-none items-center justify-center" style={{ width: size, height: size }} data-testid={testId}>
      <svg viewBox="0 0 128 128" className="absolute inset-0 -rotate-90" style={{ width: size, height: size }} aria-hidden>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--fl-border)" strokeWidth="12" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--fl-primary)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - (of ? Math.min(value, of) / of : 0))} className="ring-fill" />
      </svg>
      <span className="relative font-bold tabular-nums" style={{ fontSize: Math.round(size * 0.23) }}>
        <CountUp text={label ?? `${value}/${of}`} />
      </span>
    </span>
  );
}

/** 12 bars, one per step: dashed outline = target, fill = actual (green on target, amber over, blue = current). */
export function StepBars({ steps, testId }: { steps: { n: number; seconds: number | null; target: number | null; current?: boolean }[]; testId?: string }) {
  const max = Math.max(1, ...steps.map((s) => Math.max(s.seconds ?? 0, s.target ?? 0)));
  return (
    <div className="flex h-[84px] items-end gap-1.5" data-testid={testId}>
      {steps.map((s) => {
        const over = s.seconds !== null && s.target !== null && s.seconds > s.target;
        return (
          <span key={s.n} className="flex h-full flex-1 flex-col items-center justify-end gap-1" data-step={s.n} title={`Step ${s.n}: ${s.seconds === null ? "—" : fmtClock(s.seconds * 1000)}${s.target === null ? "" : ` / ${fmtClock(s.target * 1000)}`}`}>
            <span className="relative w-full flex-1">
              {s.target !== null && <span className="absolute inset-x-0 bottom-0 rounded-[4px] border border-dashed border-line-strong" style={{ height: `${(s.target / max) * 100}%` }} />}
              {s.seconds !== null && (
                <span
                  className={cx("bar-grow absolute inset-x-0.5 bottom-0 rounded-[3px]", s.current ? "bg-blue" : over ? "bg-amber" : "bg-primary")}
                  style={{ height: `${Math.max(2, (s.seconds / max) * 100)}%` }}
                />
              )}
            </span>
            <span className="text-[10px] text-muted">{s.n}</span>
          </span>
        );
      })}
    </div>
  );
}

/** 12 squares: green = right first time, amber = redone, outline = current, grey = not yet. */
export function StepSquares({ looks, testId }: { looks: ("right" | "redone" | "current" | "todo")[]; testId?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {looks.map((l, i) => (
        <span
          key={i}
          data-look={l}
          className={cx(
            "flex size-7 items-center justify-center rounded-[7px] text-[12px] font-semibold transition-colors duration-[600ms]",
            l === "right" && "bg-primary text-on-strong",
            l === "redone" && "bg-amber text-on-amber",
            l === "current" && "border-2 border-primary bg-surface text-primary-ink",
            l === "todo" && "bg-surface-2 text-muted",
          )}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}


export function CheckMetrics({ state, now }: { state: CheckState; now: number }) {
  const sopStep = useSopStep();
  const takt = checkTargetSeconds(useSopRevision());
  const cur = Math.min(state.current, 12);
  const done = stepsDone(state);
  const points = checkPointsDone(state);
  const devs = state.deviations;
  const conf = conformanceSoFar(state);
  const decided = state.steps.filter((r) => r.outcome !== "pending" || devs.some((d) => d.step === r.n));
  const right = decided.filter((r) => isRightFirstTime(state, r.n)).length;
  const phaseIndex = PHASES.indexOf(sopStep(cur).phase);

  const bars = STEPS.map((s) => {
    const ms = stepActiveMs(state, s.n);
    const live = s.n === state.current && state.current <= 12;
    const from = s.n === 1 ? state.startedAt : state.steps[s.n - 2].doneAt;
    const seconds = ms !== null ? ms / 1000 : live && from !== null ? activeBetween(state, from, now) / 1000 : null;
    return { n: s.n, seconds, target: sopStep(s.n).targetCtSeconds, current: live };
  });
  const looks = STEPS.map((s) => {
    const r = state.steps[s.n - 1];
    if (s.n === state.current) return "current" as const;
    if (r.doneAt === null) return "todo" as const;
    return isRightFirstTime(state, s.n) ? ("right" as const) : ("redone" as const);
  });

  return (
    <div className="grid grid-cols-3 gap-3" data-testid="metrics">
      <div className={cx(CARD, "flex-row items-center gap-5")}>
        <BigRing value={done} of={12} testId="steps-ring" />
        <span className="flex min-w-0 flex-col">
          <span className={LABEL}>Steps done</span>
          <span className="text-[28px] leading-tight font-bold">{devs.length ? "Deviations corrected" : "On track"}</span>
        </span>
      </div>

      <div className={cx(CARD, "flex-row items-center gap-5")}>
        <BigRing value={points} of={TOTAL_CHECK_POINTS} testId="points-ring" />
        <span className="flex min-w-0 flex-col">
          <span className={LABEL}>Check points</span>
          <span className="text-[28px] leading-tight font-bold">
            <CountUp text={`${TOTAL_CHECK_POINTS - points} left`} />
          </span>
          <span className="text-[15px] text-muted">In sequence</span>
        </span>
      </div>

      <div className={CARD} data-testid="cycle-card">
        <div className="flex items-start justify-between gap-3">
          <span className="flex flex-col">
            <span className={LABEL}>Cycle time</span>
            <span className="text-[52px] leading-none font-bold tabular-nums" data-testid="cycle-time">
              {fmtClock(elapsedMs(state, now))}
            </span>
          </span>
          <span className="flex flex-col items-end">
            <span className={LABEL}>Takt</span>
            <span className="text-[28px] font-bold text-ink-2 tabular-nums">{takt === null ? "—" : fmtClock(takt * 1000)}</span>
          </span>
        </div>
        <StepBars steps={bars} testId="cycle-bars" />
        <span className="flex flex-wrap gap-x-3 text-[13px] text-muted">
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-primary" />on time</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-amber" />over</span>
          {state.current <= 12 && (
            <span>
              <i className="mr-1 inline-block size-2.5 rounded-sm bg-blue" />
              step {cur} · {bars[cur - 1].seconds === null ? "—" : fmtClock(bars[cur - 1].seconds! * 1000)}
              {bars[cur - 1].target === null ? "" : ` / ${fmtClock(bars[cur - 1].target! * 1000)}`}
            </span>
          )}
        </span>
      </div>

      <div className={CARD} data-testid="deviations-card">
        <span className={LABEL}>Deviations</span>
        <span className="flex items-baseline gap-3">
          <span className={cx("text-[52px] leading-none font-bold", devs.length ? "text-amber-ink" : "text-primary-ink")} data-testid="deviation-count">
            <CountUp text={String(devs.length)} />
          </span>
          <span className="text-[16px] text-muted">{devs.length ? "this check" : "Clean run so far"}</span>
        </span>
        <ul className="flex flex-col gap-1.5">
          {devs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-[10px] border-l-4 border-amber bg-amber-soft px-3 py-1.5 text-[14px]" data-deviation={d.step}>
              <b>Step {d.step}</b>
              <span className="min-w-0 flex-1 truncate">{deviationText(d).sub}</span>
              <span className={cx("font-semibold", d.fixedAt ? "text-primary-ink" : "text-amber-ink")}>{d.fixedAt ? "Fixed ✓" : "Open"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={CARD} data-testid="conformance-card">
        <span className={LABEL}>Conformance · right first time</span>
        <span className="flex items-baseline gap-3">
          <span className={cx("text-[52px] leading-none font-bold", confTone(conf))} data-testid="conformance-value">
            {conf === null ? "—" : <CountUp text={`${conf}%`} />}
          </span>
          <span className="text-[16px] text-muted">
            {right} of {decided.length} steps
          </span>
        </span>
        <StepSquares looks={looks} testId="step-squares" />
      </div>

      <div className={CARD} data-testid="phase-card">
        <span className={LABEL}>Phase</span>
        <span className="text-[52px] leading-none font-bold">{sopStep(cur).phase}</span>
        <span className="flex flex-wrap gap-1.5">
          {PHASES.map((p, i) => (
            <span
              key={p}
              data-phase={p}
              className={cx(
                "rounded-full px-3 py-1 text-[14px] font-semibold",
                state.current > 12 || i < phaseIndex ? "bg-primary text-on-strong" : i === phaseIndex ? "border-2 border-primary text-primary-ink" : "bg-surface-2 text-muted",
              )}
            >
              {p}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
