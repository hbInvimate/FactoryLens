"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { SHIFTS } from "@/lib/config";
import { RANGES, type Range } from "@/lib/dashboard/metrics";
import { dashHref, parseShift, type DashParams } from "@/lib/dashboard/params";

const SELECT =
  "min-h-[56px] rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink disabled:bg-surface-2 disabled:text-subtle";

/** Station, date range, shift and the sample-data switch. They apply to the tiles, the blocks and the table. */
type Field = "station" | "range" | "shift" | "sample";

export function Filters({ stations, params, base, fields = ["station", "range", "shift", "sample"] }: {
  stations: string[];
  params: DashParams;
  /** The page the filters belong to. Default /dashboard. */
  base?: string;
  /** Which filters to show. Default all four. */
  fields?: Field[];
}) {
  const has = (f: Field) => fields.includes(f);
  const router = useRouter();
  const [pending, start] = useTransition();
  // Controls move at once; the page catches up when the new data arrives.
  const [shown, setShown] = useOptimistic(params);
  const go = (change: Partial<DashParams>) =>
    start(() => {
      setShown({ ...params, ...change });
      router.push(dashHref(params, change, base));
    });

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      {has("station") && (
        <label className="flex items-center gap-2">
          <span className="text-[15px] text-ink-2">Station</span>
          <select aria-label="Station" className={SELECT} value={shown.station} onChange={(e) => go({ station: e.target.value, dev: null })}>
            {stations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      {has("range") && (
        <select aria-label="Date range" className={SELECT} value={shown.range} onChange={(e) => go({ range: e.target.value as Range })}>
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      )}
      {has("shift") && (
        <select aria-label="Shift" className={SELECT} value={shown.shift ?? "all"} onChange={(e) => go({ shift: parseShift(e.target.value) })}>
          <option value="all">All shifts</option>
          {SHIFTS.map((s) => (
            <option key={s.id} value={s.id}>
              Shift {s.id} ({s.start} to {s.end})
            </option>
          ))}
        </select>
      )}
      {has("sample") && (
        <label className="flex min-h-[56px] cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[16px]">
          <input type="checkbox" className="size-6 accent-primary" checked={shown.sample} onChange={(e) => go({ sample: e.target.checked })} />
          Include sample data
        </label>
      )}
      {pending && <span className="text-[14px] text-blue-ink">Loading…</span>}
    </div>
  );
}
