"use client";
// The SOP step list on the check screen as a vertical timeline. Display and motion only: every control and handler
// (points, values, Step details, Back, Next step) comes from MainView unchanged, as `current`.
// Motion: the card of the step just left collapses while the new one opens (CSS keyframes in globals.css), the green
// line follows the current dot, a newly done dot pops its tick, then the list scrolls the current step near the top.
import { useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import { isRightFirstTime } from "@/lib/check/reducer";
import type { CheckState } from "@/lib/check/types";
import { useSopStep } from "@/lib/client/sopContext";
import { STEPS } from "@/lib/sop";
import { Chip, cx } from "../ui";

/**
 * Card buttons are 48 px, 16 px text, and never wrap (an agreed exception to the 56 px rule, like the 44 px rows),
 * so Step details, Back and Next step fit on one row.
 */
const CARD =
  "flex flex-col gap-2 rounded-[18px] bg-primary-soft px-4 py-3 [&_button]:whitespace-nowrap [&_button.tap]:min-h-[48px]! [&_button.tap]:px-3.5! [&_button.tap]:text-[16px]!";

export function StepTimeline({
  state, cur, onRow, current,
}: {
  state: CheckState;
  /** The current step, 1 to 12. */
  cur: number;
  /** Tap on a row that is not current: a done step (go back) or one not reached yet (its details). */
  onRow: (n: number) => void;
  /** The current step's card body under its title: points, values and buttons. */
  current: ReactNode;
}) {
  const sopStep = useSopStep();
  const listRef = useRef<HTMLOListElement>(null);
  const greyRef = useRef<HTMLSpanElement>(null);
  const greenRef = useRef<HTMLSpanElement>(null);
  // The step just left: its card collapses for 450 ms. Derived while rendering; cleared when the animation ends.
  const [prev, setPrev] = useState(cur);
  const [leaving, setLeaving] = useState<number | null>(null);
  if (prev !== cur) {
    setPrev(cur);
    setLeaving(prev);
  }

  // The lines: grey from the first dot to the last, green from the first dot to the current one.
  useLayoutEffect(() => {
    const ol = listRef.current;
    if (!ol) return;
    const place = () => {
      const dots = [...ol.querySelectorAll<HTMLElement>("[data-dot]")];
      if (!dots.length || !greyRef.current || !greenRef.current) return;
      const base = ol.getBoundingClientRect().top - ol.scrollTop;
      const mid = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 - base;
      };
      const first = mid(dots[0]);
      const now = dots.find((d) => d.dataset.dot === "current") ?? dots[dots.length - 1];
      greyRef.current.style.top = greenRef.current.style.top = `${first}px`;
      greyRef.current.style.height = `${mid(dots[dots.length - 1]) - first}px`;
      greenRef.current.style.height = `${Math.max(0, mid(now) - first)}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ol.querySelectorAll("li").forEach((li) => ro.observe(li));
    return () => ro.disconnect();
  }, [cur, leaving]);

  const collapsed = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    setLeaving(null);
    const ol = listRef.current;
    const li = ol?.querySelector<HTMLElement>("[aria-current=step]");
    if (!ol || !li) return;
    const top = li.getBoundingClientRect().top - ol.getBoundingClientRect().top + ol.scrollTop - 8;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ol.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <ol ref={listRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 pl-1" data-testid="step-list">
      <span ref={greyRef} aria-hidden className="pointer-events-none absolute left-[17px] w-[3px] rounded-full bg-line" />
      <span ref={greenRef} aria-hidden className="tl-line pointer-events-none absolute left-[17px] w-[3px] rounded-full bg-primary" />
      {STEPS.map((s) => {
        const r = state.steps[s.n - 1];
        const def = sopStep(s.n);
        if (s.n === cur) {
          return (
            <li key={s.n} aria-current="step" className="grid grid-cols-[29px_minmax(0,1fr)] gap-x-3 py-1.5">
              <span
                data-dot="current"
                className="relative z-10 mt-3 flex size-[29px] items-center justify-center rounded-full border-[3px] border-primary bg-surface text-[13px] font-bold text-primary-ink shadow-[0_0_0_6px_var(--fl-primary-soft)]"
              >
                {s.n}
              </span>
              <div className="tl-open">
                {/* Clipped while it opens, with room for the lifted card's shadow. */}
                <div className="tl-lift min-h-0 overflow-clip [overflow-clip-margin:56px]">
                  <div className={cx(CARD, "tl-fade shadow-[0_20px_50px_rgba(0,0,0,0.15)]")} data-compact>
                    <span className="text-[13px] font-semibold tracking-wide text-primary-ink uppercase" data-testid="step-of">
                      Step {s.n} of 12 · {def.phase}
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-[23px] font-extrabold leading-tight">
                      {s.name}
                      {r.reconfirm && <Chip tone="amber">Re-confirm</Chip>}
                    </span>
                    <span className="text-[16px] text-ink-2">Correct: {def.correct}</span>
                    {current}
                  </div>
                </div>
              </div>
            </li>
          );
        }
        const done = r.doneAt !== null;
        return (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => onRow(s.n)}
              data-step={s.n}
              // 44 px rows so all 12 steps fit at 1440 x 900 (agreed exception to the 56 px rule). Focus mode: faded
              // to 35% until hovered, focused or tapped.
              className="grid min-h-[44px] w-full grid-cols-[29px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[10px] pr-2 text-left opacity-35 transition-opacity duration-300 hover:bg-surface-2 hover:opacity-100 focus-visible:opacity-100 active:opacity-100"
            >
              <span
                data-dot={done ? "done" : "upcoming"}
                className={cx(
                  "relative z-10 flex size-[29px] items-center justify-center rounded-full text-[13px] font-bold",
                  done ? (isRightFirstTime(state, s.n) ? "bg-primary text-on-strong" : "bg-amber text-on-amber") : "border-2 border-line-strong bg-surface text-muted",
                )}
              >
                {done ? <span className={cx("inline-block", s.n === leaving && "tl-pop")}>✓</span> : s.n}
              </span>
              <span className={cx("text-[17px] leading-tight", done ? "text-muted" : "font-semibold text-ink")}>{s.name}</span>
              {r.reconfirm && (
                <Chip small tone="amber">
                  re-confirm
                </Chip>
              )}
            </button>
            {leaving === s.n && (
              // The card of the step just left, collapsing. Display only.
              <div className="tl-close ml-[41px]" onAnimationEnd={collapsed} aria-hidden inert>
                <div className="min-h-0 overflow-hidden">
                  <div className={CARD}>
                    <span className="text-[13px] font-semibold tracking-wide text-primary-ink uppercase">
                      Step {s.n} of 12 · {def.phase}
                    </span>
                    <span className="text-[16px] text-ink-2">Correct: {def.correct}</span>
                  </div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
