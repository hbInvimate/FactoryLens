"use client";
// Station, date range, shift, step and source. Changing one reloads the table (page 1).
import Form from "next/form";
import { SHIFTS } from "@/lib/config";
import { RANGES } from "@/lib/dashboard/metrics";
import { POINT_GROUPS, groupLabel } from "@/lib/measure-judge";

const SELECT = "min-h-[56px] rounded-lg border border-line-strong bg-surface px-3 text-[16px] text-ink";

export function MeasurementFilters({ stations, value }: { stations: string[]; value: { view: string; station: string; range: string; shift: string; step: string; source: string; sort: string; dir: string; group: string } }) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <Form action="/dashboard/measurements" className="flex flex-wrap items-center gap-3" data-testid="measurement-filters">
      <input type="hidden" name="view" value={value.view} />
      <input type="hidden" name="sort" value={value.sort} />
      <input type="hidden" name="dir" value={value.dir} />
      <label className="flex items-center gap-2">
        <span className="text-[15px] text-ink-2">Station</span>
        <select name="station" aria-label="Station" defaultValue={value.station} onChange={submit} className={SELECT}>
          {stations.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <select name="range" aria-label="Date range" defaultValue={value.range} onChange={submit} className={SELECT}>
        {RANGES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <select name="shift" aria-label="Shift" defaultValue={value.shift} onChange={submit} className={SELECT}>
        <option value="all">All shifts</option>
        {SHIFTS.map((s) => (
          <option key={s.id} value={s.id}>
            Shift {s.id} ({s.start} to {s.end})
          </option>
        ))}
      </select>
      {value.view === "list" && (
      <select name="step" aria-label="Step" defaultValue={value.step} onChange={submit} className={SELECT}>
        <option value="">Steps 7 to 10</option>
        {[7, 8, 9, 10].map((n) => (
          <option key={n} value={n}>
            Step {n}
          </option>
        ))}
      </select>
      )}
      <select name="source" aria-label="Source" defaultValue={value.source} onChange={submit} className={SELECT}>
        <option value="">All sources</option>
        <option value="voice">Voice</option>
        <option value="typed">Typed</option>
        <option value="demo">Demo</option>
      </select>
      {value.view !== "list" && (
        <select name="group" aria-label="Points" defaultValue={value.group} onChange={submit} className={SELECT}>
          {POINT_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {groupLabel(g.id)}
            </option>
          ))}
        </select>
      )}
    </Form>
  );
}
