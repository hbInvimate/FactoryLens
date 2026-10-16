"use client";
// The video placeholder with the 12 steps sized by their time in the check; changed steps highlighted.
import { useState } from "react";
import { cx } from "@/components/ui";

export function RecordedOperation({ stepNames, clips, marked }: { stepNames: string[]; clips: { step: number; startSecond: number; endSecond: number }[]; marked: number[] }) {
  const [selected, setSelected] = useState<number | null>(marked[0] ?? null);
  const dur = (n: number) => {
    const c = clips.find((x) => x.step === n);
    return c ? Math.max(1, c.endSecond - c.startSecond) : 1;
  };
  const on = new Set(marked);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex aspect-[16/5] items-center justify-center rounded-card bg-ink text-[16px] text-on-strong" data-testid="video-placeholder">
        ▶ Video placeholder: not recorded yet{selected ? ` · step ${selected}` : ""}
      </div>
      <div className="flex gap-1" role="group" aria-label="The 12 steps, sized by their time in this check" data-testid="step-strip">
        {stepNames.map((name, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              type="button"
              title={`Step ${n}: ${name}`}
              aria-pressed={selected === n}
              onClick={() => setSelected(n)}
              style={{ flexGrow: dur(n), flexBasis: 0 }}
              data-marked={on.has(n) ? "1" : "0"}
              className={cx(
                "min-h-[44px] min-w-[28px] rounded-[6px] border text-[13px] font-semibold",
                on.has(n) ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface-2 text-muted",
                selected === n && "ring-2 ring-primary",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
