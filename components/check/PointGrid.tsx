"use client";
// The points of one step. The Quality Technician taps a point when she has tried the pin or gauge there.
// Feature IDs only, never a value.
import { cx } from "../ui";

export type PointLook = "open" | "done" | "wrong" | "missing";

export function PointGrid({
  points, look, onTap, disabled, ordered, label,
}: {
  points: string[];
  look: (p: string) => PointLook;
  onTap?: (p: string) => void;
  disabled?: boolean;
  /** Clamps: square tiles, as on the fixture. */
  ordered?: boolean;
  label: string;
}) {
  const cols = points.length > 8 ? "grid-cols-7" : points.length > 6 ? "grid-cols-8" : "grid-cols-6";
  return (
    <div role="group" aria-label={label} className={cx("grid gap-2", cols)}>
      {points.map((p) => {
        const l = look(p);
        return (
          <button
            key={p}
            type="button"
            aria-pressed={l === "done"}
            aria-label={p}
            disabled={disabled || !onTap || l === "done"}
            onClick={() => onTap?.(p)}
            data-look={l}
            className={cx(
              "tap flex items-center justify-center border-[3px] text-[20px] font-semibold transition",
              ordered ? "rounded-lg" : "rounded-full",
              l === "done" && "border-green bg-green text-green-ink",
              l === "wrong" && "border-red bg-red text-red-ink",
              l === "missing" && "border-amber bg-transparent text-amber-soft",
              l === "open" && "border-edge bg-deep text-ink hover:border-blue",
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
