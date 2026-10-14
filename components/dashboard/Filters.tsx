"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { RANGES, type Range } from "@/lib/dashboard/metrics";

const SELECT =
  "min-h-[56px] rounded-lg border border-[#cfd5dc] bg-white px-3 text-[16px] text-[#1b1f24] disabled:bg-[#f4f5f7] disabled:text-[#8a929c]";

/** Station, date range, shift and the sample-data switch. Changing one reloads the page with the filter in the URL. */
export function Filters({
  stations, station, range, includeSample,
}: {
  stations: string[];
  station: string;
  range: Range;
  includeSample: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // The switch moves at once; the page catches up when the new data arrives.
  const [sampleShown, setSampleShown] = useOptimistic(includeSample);
  const go = (s: string, r: Range, sample: boolean) =>
    start(() => {
      setSampleShown(sample);
      router.push(`/dashboard?station=${encodeURIComponent(s)}&range=${r}&sample=${sample ? 1 : 0}`);
    });

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <label className="flex items-center gap-2">
        <span className="text-[15px] text-[#4b5563]">Station</span>
        <select aria-label="Station" className={SELECT} value={station} onChange={(e) => go(e.target.value, range, includeSample)}>
          {stations.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <select aria-label="Date range" className={SELECT} value={range} onChange={(e) => go(station, e.target.value as Range, includeSample)}>
        {RANGES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <select aria-label="Shift" className={SELECT} disabled title="Shift filtering comes in the next phase" defaultValue="all">
        <option value="all">All shifts</option>
        <option value="A">Shift A</option>
        <option value="B">Shift B</option>
        <option value="C">Shift C</option>
      </select>
      <label className="flex min-h-[56px] cursor-pointer items-center gap-2 rounded-lg border border-[#cfd5dc] bg-white px-3 text-[16px]">
        <input
          type="checkbox"
          className="size-6 accent-[#1f5fcf]"
          checked={sampleShown}
          onChange={(e) => go(station, range, e.target.checked)}
        />
        Include sample data
      </label>
      {pending && <span className="text-[14px] text-[#1f5fcf]">Loading…</span>}
    </div>
  );
}
