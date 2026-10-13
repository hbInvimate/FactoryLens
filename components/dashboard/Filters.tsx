"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RANGES, type Range } from "@/lib/dashboard/metrics";

const SELECT =
  "min-h-[56px] rounded-lg border border-[#cfd5dc] bg-white px-3 text-[16px] text-[#1b1f24] disabled:bg-[#f4f5f7] disabled:text-[#8a929c]";

/** Station, date range and shift. Changing one reloads the page with the new filter in the URL. */
export function Filters({ stations, station, range }: { stations: string[]; station: string; range: Range }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (s: string, r: Range) => start(() => router.push(`/dashboard?station=${encodeURIComponent(s)}&range=${r}`));

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <label className="flex items-center gap-2">
        <span className="text-[15px] text-[#4b5563]">Station</span>
        <select aria-label="Station" className={SELECT} value={station} onChange={(e) => go(e.target.value, range)}>
          {stations.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <select aria-label="Date range" className={SELECT} value={range} onChange={(e) => go(station, e.target.value as Range)}>
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
      <span className="text-[13px] text-[#6b7480]">Shift filter: coming next</span>
      {pending && <span className="text-[14px] text-[#1f5fcf]">Loading…</span>}
    </div>
  );
}
