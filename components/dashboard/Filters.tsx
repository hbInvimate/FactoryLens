"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { SHIFTS } from "@/lib/config";
import { RANGES, type Range } from "@/lib/dashboard/metrics";
import { dashHref, parseShift, type DashParams } from "@/lib/dashboard/params";

const SELECT =
  "min-h-[56px] rounded-lg border border-[#cfd5dc] bg-white px-3 text-[16px] text-[#1b1f24] disabled:bg-[#f4f5f7] disabled:text-[#8a929c]";

/** Station, date range, shift and the sample-data switch. They apply to the tiles, the blocks and the table. */
export function Filters({ stations, params }: { stations: string[]; params: DashParams }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Controls move at once; the page catches up when the new data arrives.
  const [shown, setShown] = useOptimistic(params);
  const go = (change: Partial<DashParams>) =>
    start(() => {
      setShown({ ...params, ...change });
      router.push(dashHref(params, change));
    });

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <label className="flex items-center gap-2">
        <span className="text-[15px] text-[#4b5563]">Station</span>
        <select aria-label="Station" className={SELECT} value={shown.station} onChange={(e) => go({ station: e.target.value, dev: null })}>
          {stations.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <select aria-label="Date range" className={SELECT} value={shown.range} onChange={(e) => go({ range: e.target.value as Range })}>
        {RANGES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <select aria-label="Shift" className={SELECT} value={shown.shift ?? "all"} onChange={(e) => go({ shift: parseShift(e.target.value) })}>
        <option value="all">All shifts</option>
        {SHIFTS.map((s) => (
          <option key={s.id} value={s.id}>
            Shift {s.id} ({s.start} to {s.end})
          </option>
        ))}
      </select>
      <label className="flex min-h-[56px] cursor-pointer items-center gap-2 rounded-lg border border-[#cfd5dc] bg-white px-3 text-[16px]">
        <input type="checkbox" className="size-6 accent-[#1f5fcf]" checked={shown.sample} onChange={(e) => go({ sample: e.target.checked })} />
        Include sample data
      </label>
      {pending && <span className="text-[14px] text-[#1f5fcf]">Loading…</span>}
    </div>
  );
}
