"use client";
import type { CheckState } from "@/lib/check/types";
import { STEPS } from "@/lib/sop";
import { Ring, Tick, Warn, cx } from "../ui";

/** The narrow SOP strip shown beside a deviation, a hold or a step detail. */
export function MiniStepList({
  state, flag, selected, onPick, short = true,
}: {
  state: CheckState;
  flag?: number;
  selected?: number;
  onPick?: (n: number) => void;
  short?: boolean;
}) {
  return (
    <ol className="flex flex-col gap-0.5">
      {STEPS.map((s) => {
        const run = state.steps[s.n - 1];
        const done = run.doneAt !== null;
        const name = short ? s.short : s.name;
        if (flag === s.n) {
          return (
            <li key={s.n} className="flex min-h-[52px] items-center gap-3 rounded-[10px] border-2 border-amber bg-amber-bg px-3">
              <Warn size={24} />
              <span className="text-[18px] font-semibold text-amber-soft">{name}</span>
            </li>
          );
        }
        const body = (
          <>
            {done ? <Tick size={24} tone={run.outcome === "corrected" ? "amber" : "green"} /> : <Ring n={s.n} size={24} active={selected === s.n} />}
            <span className={cx("text-left text-[17px]", done ? "text-muted" : "text-ink", selected === s.n && "font-semibold text-ink")}>{name}</span>
          </>
        );
        return (
          <li key={s.n}>
            {onPick ? (
              <button
                type="button"
                onClick={() => onPick(s.n)}
                className={cx(
                  "tap flex w-full items-center gap-3 rounded-[10px] px-3",
                  selected === s.n ? "border-2 border-blue bg-sel" : "hover:bg-panel",
                )}
              >
                {body}
              </button>
            ) : (
              <div className="flex min-h-11 items-center gap-3 px-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
