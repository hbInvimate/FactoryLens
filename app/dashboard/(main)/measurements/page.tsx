// /dashboard/measurements: every value recorded at steps 7 to 10. The line view colours each value against the SOP
// tolerance (lib/config.ts), with KPIs and the worst drifting point. Quality Engineer and admin only.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { ButtonLink, Chip, Table, Tabs, Td, Th } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { MeasurementFilters } from "@/components/measurements/MeasurementFilters";
import { cx } from "@/components/ui";
import { StatTile } from "@/components/ds";
import { IconAlert, IconChecklist, IconTarget } from "@/components/ds/icons";
import { MEASUREMENT_UNIT, NEAR_LIMIT_SHARE } from "@/lib/config";
import { POINT_GROUPS, drift, groupLabel, judge, likelyCause, toleranceOf, type PointGroupId } from "@/lib/measure-judge";
import { dashView, type DashView } from "@/lib/server/dashView";
import { PAGE_SIZE, WIDE_LIMIT, listMeasurements, parseMeasurementParams, wideMeasurements, type Sort, type Source } from "@/lib/server/measurements";
import { WideTable } from "@/components/measurements/WideTable";
import { NotConfigured } from "@/lib/server/repo";

export const metadata = { title: "FactoryLens AI: measurements" };

const COLUMNS: { key: Sort | null; label: string }[] = [
  { key: "recorded", label: "Date" },
  { key: "technician", label: "Quality Technician" },
  { key: "station", label: "Station" },
  { key: null, label: "Session" },
  { key: "step", label: "Step" },
  { key: "point", label: "Point" },
  { key: "value", label: "Value" },
  { key: null, label: "Unit" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
];

async function Body({ searchParams }: { searchParams: PageProps<"/dashboard/measurements">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  let view;
  try {
    view = await dashView({ ...sp, sample: "0" });
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-5 py-4">The database is not set up. See the README: Set up the database.</Card>;
    throw e;
  }
  const { stations, params, f } = view;
  const m = parseMeasurementParams(sp);
  const viewKind = sp.view === "list" ? "list" : "line";
  const group: PointGroupId = POINT_GROUPS.some((g) => g.id === sp.group) ? (sp.group as PointGroupId) : "holes";
  const base = { view: viewKind, station: params.station, range: params.range, shift: params.shift ?? "all", step: m.step ? String(m.step) : "", source: m.source ?? "", sort: m.sort, dir: m.dir, group };
  const href = (change: Record<string, string | number>) => `/dashboard/measurements?${new URLSearchParams({ ...base, page: String(m.page), ...Object.fromEntries(Object.entries(change).map(([k, v]) => [k, String(v)])) })}`;
  const csv = `/api/measurements/csv?${new URLSearchParams(base)}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-[30px] font-bold">Measurements</h1>
        <span className="flex-1" />
        <ButtonLink href={csv} data-testid="csv-export">
          Export CSV
        </ButtonLink>
      </div>
      <Tabs
        label="View"
        items={[
          { href: `/dashboard/measurements?${new URLSearchParams({ ...base, view: "line" })}`, label: "All values in a line", active: viewKind === "line" },
          { href: `/dashboard/measurements?${new URLSearchParams({ ...base, view: "list" })}`, label: "List", active: viewKind === "list" },
        ]}
      />
      <MeasurementFilters stations={stations} value={base} />
      {viewKind === "line" ? <Line f={f} source={m.source} group={group} station={params.station} /> : <List f={f} m={m} href={href} />}
    </>
  );
}

async function Line({ f, source, group, station }: { f: DashView["f"]; source: Source | null; group: PointGroupId; station: string }) {
  const { count, rows } = await wideMeasurements(f, source);
  const points = POINT_GROUPS.find((g) => g.id === group)!.points;
  const list = rows ?? [];
  // KPIs over the latest value of each point in this group, in the checks shown.
  let readings = 0;
  let out = 0;
  let near = 0;
  const per = new Map<string, { out: number; near: number }>();
  for (const r of list)
    for (const p of points) {
      const c = r.cells[p];
      if (!c) continue;
      readings++;
      const j = judge(p, c.latest);
      const e = per.get(p) ?? { out: 0, near: 0 };
      if (j === "out") {
        out++;
        e.out++;
      }
      if (j === "near") {
        near++;
        e.near++;
      }
      per.set(p, e);
    }
  const series = (p: string) => [...list].reverse().flatMap((r) => (r.cells[p] ? [{ value: r.cells[p].latest, at: r.cells[p].at, sessionId: r.sessionId }] : []));
  const ranked = [...per.entries()].sort((a, b) => b[1].out * 2 + b[1].near - (a[1].out * 2 + a[1].near));
  const worst = ranked[0] && ranked[0][1].out + ranked[0][1].near > 0 ? ranked[0][0] : null;
  const worstDrift = worst ? drift(series(worst)) : null;
  // The banner: the point drifting furthest toward or past a limit; else the worst point; none when all are in tolerance.
  const drifting = points
    .map((p) => ({ p, d: drift(series(p)), s: series(p) }))
    .filter((x) => x.d && x.s.length > 0 && judge(x.p, x.s[x.s.length - 1].value) !== "in")
    .sort((a, b) => Math.abs(b.d!.to - b.d!.from) - Math.abs(a.d!.to - a.d!.from))[0];
  const banner = drifting
    ? {
        point: drifting.p,
        text: `${drifting.p} is drifting ${drifting.d!.dir}: ${drifting.d!.from} → ${drifting.d!.to} ${MEASUREMENT_UNIT} over the last ${drifting.d!.n} checks, now ${judge(drifting.p, drifting.d!.to) === "out" ? "out of tolerance" : "near the limit"}. Likely cause: ${likelyCause(drifting.p)} at ${station}. Suggest checking it before the next shift.`,
      }
    : worst
      ? { point: worst, text: `${worst} is the worst point: ${per.get(worst)!.out} out of tolerance and ${per.get(worst)!.near} near the limit in ${list.length} checks. Likely cause: ${likelyCause(worst)} at ${station}.` }
      : null;
  const tol = toleranceOf(points[0]);
  const allComplete = list.length > 0 && list.every((r) => r.status === "complete");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="measurement-kpis">
        <StatTile icon={<IconChecklist />} tone="blue" value={list.length} label="Checks" sub={`${allComplete ? "all complete · " : ""}${readings} readings`} testId="kpi-checks" />
        <StatTile icon={<IconAlert />} tone="red" valueTone={out ? "red" : undefined} value={out} label="Out of tolerance" sub={tol ? `${tol.nominal.toFixed(2)} ± ${tol.tol} ${MEASUREMENT_UNIT}` : undefined} testId="kpi-out" />
        <StatTile icon={<IconAlert />} tone="amber" valueTone={near ? "amber" : undefined} value={near} label="Near the limit" sub={tol ? `within ${+(tol.tol * NEAR_LIMIT_SHARE).toFixed(3)} ${MEASUREMENT_UNIT} of a limit` : undefined} testId="kpi-near" />
        <StatTile
          icon={<IconTarget />}
          tone="violet"
          value={worst ?? "—"}
          label="Worst point"
          sub={worst ? (worstDrift ? `drifting ${worstDrift.dir} · ${worstDrift.n} checks in a row` : `${per.get(worst)!.out} out, ${per.get(worst)!.near} near`) : "all in tolerance"}
          testId="kpi-worst"
        />
      </div>
    <Card className="flex flex-col gap-3 px-6 py-5">
      <p className="text-[15px] font-semibold" data-testid="check-count">
        {count} {count === 1 ? "check" : "checks"} · {groupLabel(group)} ({MEASUREMENT_UNIT})
      </p>
      {!rows ? (
        <p className="rounded-card border border-amber-line bg-amber-soft px-4 py-3 text-[15px] text-amber-ink" data-testid="wide-too-many">
          More than {WIDE_LIMIT.toLocaleString("en-US")} checks match. Narrow the date range to see them on one page.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-[15px] text-ink-2" data-testid="measurements-empty">
          No values recorded in this view yet.
        </p>
      ) : (
        <>
          <WideTable rows={rows} points={points} banner={banner} />
        </>
      )}
    </Card>
    </>
  );
}

async function List({ f, m, href }: { f: DashView["f"]; m: ReturnType<typeof parseMeasurementParams>; href: (change: Record<string, string | number>) => string }) {
  const { rows, total } = await listMeasurements({ f: { ...f, includeSample: false }, ...m });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <Card className="flex flex-col gap-3 px-6 py-5">
        <p className="text-[14px] text-muted" data-testid="measurement-count">
          {total} {total === 1 ? "value" : "values"}
          {total > PAGE_SIZE ? `, page ${m.page} of ${pages}` : ""}. A corrected value is a new row; the old one stays.
        </p>
        {rows.length === 0 ? (
          <p className="py-4 text-[15px] text-ink-2" data-testid="measurements-empty">
            No values recorded in this view yet.
          </p>
        ) : (
          <Table minWidth={1000} testId="measurements-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <Th key={c.label}>
                    {c.key ? (
                      <Link
                        href={href({ sort: c.key, dir: m.sort === c.key && m.dir === "desc" ? "asc" : "desc", page: 1 })}
                        className={cx("hover:underline", m.sort === c.key && "text-ink")}
                        aria-sort={m.sort === c.key ? (m.dir === "asc" ? "ascending" : "descending") : undefined}
                      >
                        {c.label}
                        {m.sort === c.key ? (m.dir === "asc" ? " ▲" : " ▼") : ""}
                      </Link>
                    ) : (
                      c.label
                    )}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-measurement={r.id} data-session={r.sessionId}>
                  <Td>
                    <LocalTime iso={r.recordedAt} />
                  </Td>
                  <Td>{r.technician}</Td>
                  <Td>{r.station}</Td>
                  <Td>
                    <Link href={`/dashboard/${r.sessionId}`} className="font-semibold text-primary-ink hover:underline">
                      View
                    </Link>
                  </Td>
                  <Td>{r.step}</Td>
                  <Td className="font-semibold">{r.point}</Td>
                  <Td data-testid="value">{r.value === null ? "—" : r.value}</Td>
                  <Td>{r.unit}</Td>
                  <Td>
                    <Chip tone={r.source === "voice" ? "blue" : r.source === "demo" ? "amber" : "gray"} size="sm">
                      {r.source === "voice" ? "Voice" : r.source === "demo" ? "Demo" : "Typed"}
                    </Chip>
                  </Td>
                  <Td>
                    <Chip tone={r.status === "recorded" ? "gray" : "amber"} size="sm">
                      {r.status}
                    </Chip>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-3">
            {m.page > 1 && <ButtonLink href={href({ page: m.page - 1 })}>Previous</ButtonLink>}
            <span className="text-[15px] text-ink-2">
              Page {m.page} of {pages}
            </span>
            {m.page < pages && <ButtonLink href={href({ page: m.page + 1 })}>Next</ButtonLink>}
          </nav>
        )}
      </Card>
    </>
  );
}

export default function MeasurementsPage(props: PageProps<"/dashboard/measurements">) {
  return (
    <Gate area="dashboard" next="/dashboard/measurements">
      <Page>
        <main className="page-main flex flex-col gap-4">
          <Suspense fallback={<Skeleton />}>
            <Body searchParams={props.searchParams} />
          </Suspense>
        </main>
      </Page>
    </Gate>
  );
}
