// /dashboard/measurements: every value recorded at steps 7 to 10, as recorded. Never judged: no tolerance,
// no pass or fail. Quality Engineer and admin only.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { ButtonLink, Chip, Table, Tabs, Td, Th } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { MeasurementFilters } from "@/components/measurements/MeasurementFilters";
import { cx } from "@/components/ui";
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
  const base = { view: viewKind, station: params.station, range: params.range, shift: params.shift ?? "all", step: m.step ? String(m.step) : "", source: m.source ?? "", sort: m.sort, dir: m.dir };
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
      {viewKind === "line" ? <Line f={f} source={m.source} /> : <List f={f} m={m} href={href} />}
    </>
  );
}

async function Line({ f, source }: { f: DashView["f"]; source: Source | null }) {
  const { count, rows } = await wideMeasurements(f, source);
  return (
    <Card className="flex flex-col gap-3 px-6 py-5">
      <p className="text-[15px] font-semibold" data-testid="check-count">
        {count} {count === 1 ? "check" : "checks"}
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
          <WideTable rows={rows} />
          <p className="text-[13px] text-muted">The latest value of each point. A dot marks a corrected value (hover for the earlier ones); D marks a demo value (invented, not a measurement). – : nothing recorded.</p>
        </>
      )}
    </Card>
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
                      Open
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
        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-6 py-6 md:px-8">
          <Suspense fallback={<Skeleton />}>
            <Body searchParams={props.searchParams} />
          </Suspense>
        </main>
      </Page>
    </Gate>
  );
}
