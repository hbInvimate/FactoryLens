// The station, range, shift and sample filters of a dashboard page, read from its URL.
import { includeSampleFor, parseRange, rangeStart } from "@/lib/dashboard/metrics";
import { parseDev, parseShift, type DashParams } from "@/lib/dashboard/params";
import { getRepo, SEED_STATION } from "./repo";
import type { DashFilter } from "./sqlparts";

export interface DashView {
  stations: string[];
  params: DashParams;
  f: DashFilter;
}

/** Throws NotConfigured when there is no database. */
export async function dashView(sp: Record<string, string | string[] | undefined>): Promise<DashView> {
  const repo = getRepo();
  const stations = await repo.stations();
  const asked = typeof sp.station === "string" ? sp.station : "";
  const station = stations.includes(asked) ? asked : stations.includes(SEED_STATION) ? SEED_STATION : stations[0];
  const params: DashParams = {
    station,
    range: parseRange(sp.range),
    shift: parseShift(sp.shift),
    sample: includeSampleFor(sp.sample, (await repo.counts()).real),
    dev: parseDev(sp.dev),
  };
  return { stations, params, f: { station, since: rangeStart(params.range), shift: params.shift, includeSample: params.sample } };
}

/** The filters as a query string, for links between the SOP pages. */
export function viewQuery(p: DashParams): string {
  return new URLSearchParams({ station: p.station, range: p.range, shift: p.shift ?? "all", sample: p.sample ? "1" : "0" }).toString();
}
