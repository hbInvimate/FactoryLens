"use client";
// The points of one step. The Quality Technician taps a point when she has tried the pin or gauge there.
// Feature IDs only, never a value.
import { cx } from "../ui";

export type PointLook = "open" | "done" | "wrong" | "missing";

export function PointGrid({
  points, look, onTap, disabled, ordered, label, doneTappable, timeline, next, sub,
}: {
  /** The check screen timeline style: 50 px chips, the value under a recorded one, the next one in amber. */
  timeline?: boolean;
  /** Timeline: the next point to record. */
  next?: string;
  /** Timeline: small text under a done point (its recorded value). */
  sub?: (p: string) => string | undefined;
  points: string[];
  look: (p: string) => PointLook;
  onTap?: (p: string) => void;
  disabled?: boolean;
  /** Clamps: square tiles, as on the fixture. */
  ordered?: boolean;
  label: string;
  /** Steps 7 to 10: a done point can be tapped to pick it for a correction of its value. */
  doneTappable?: boolean;
}) {
  const cols = points.length > 8 ? "grid-cols-7" : points.length > 6 ? "grid-cols-8" : "grid-cols-6";
  return (
    <div role="group" aria-label={label} className={cx("grid gap-2", cols)}>
      {points.map((p) => {
        const l = look(p);
        if (timeline) {
          const small = l === "done" ? sub?.(p) : undefined;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={l === "done"}
              aria-label={p}
              disabled={disabled || !onTap || (l === "done" && !doneTappable)}
              onClick={() => onTap?.(p)}
              data-look={l}
              data-next={l === "open" && p === next ? "" : undefined}
              className={cx(
                "flex h-[50px] min-w-0 flex-col items-center justify-center border-2 font-semibold leading-none transition-colors duration-[250ms]",
                ordered ? "rounded-lg" : "rounded-full",
                l === "done" && "border-primary bg-primary text-on-strong",
                l === "wrong" && "border-red bg-red text-on-strong",
                l === "missing" && "border-amber bg-surface text-amber-ink",
                l === "open" && (p === next ? "border-amber bg-surface text-ink" : "border-primary-faint bg-surface text-ink"),
                "disabled:cursor-default",
              )}
            >
              <span className="text-[17px]">{p}</span>
              {small && <span className="mt-0.5 text-[11px] font-medium">{small}</span>}
            </button>
          );
        }
        return (
          <button
            key={p}
            type="button"
            aria-pressed={l === "done"}
            aria-label={p}
            disabled={disabled || !onTap || (l === "done" && !doneTappable)}
            onClick={() => onTap?.(p)}
            data-look={l}
            className={cx(
              "tap flex items-center justify-center border-[3px] text-[20px] font-semibold transition",
              ordered ? "rounded-lg" : "rounded-full",
              l === "done" && "border-primary bg-primary text-on-strong",
              l === "wrong" && "border-red bg-red text-on-strong",
              l === "missing" && "border-amber bg-transparent text-amber-ink",
              l === "open" && "border-line-strong bg-surface-2 text-ink hover:border-blue",
              "disabled:cursor-default",
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
