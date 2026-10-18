// "All values in a line": one row per check, one column per point. The first four columns and the two header
// rows stay put while the table scrolls inside the page. A dot marks a corrected value; "D" a demo value.
import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { cx } from "@/components/ui";
import { MEASUREMENT_UNIT } from "@/lib/config";
import { FEATURE_GROUPS, type WideRow } from "@/lib/server/measurements";

/** Fixed column widths and their left offsets, so the first four columns can stick. */
const FIXED = [
  { label: "Date", w: 150 },
  { label: "Quality Technician", w: 170 },
  { label: "Station", w: 170 },
  { label: "Session", w: 80 },
];
const LEFT = FIXED.map((_, i) => FIXED.slice(0, i).reduce((a, c) => a + c.w, 0));
const HEAD1 = 36;

const stick = "sticky z-10 bg-surface";
const th = "border-b border-line px-3 text-left text-[13px] font-semibold text-muted whitespace-nowrap";

export function WideTable({ rows }: { rows: WideRow[] }) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-card border border-line bg-surface" data-testid="wide-scroll">
      <table className="border-separate border-spacing-0 text-[14px]" data-testid="wide-table">
        <thead>
          <tr style={{ height: HEAD1 }}>
            {FIXED.map((c, i) => (
              <th key={c.label} rowSpan={2} className={cx(th, stick, "top-0 z-30 bg-surface-2 align-bottom pb-2")} style={{ left: LEFT[i], minWidth: c.w, maxWidth: c.w }}>
                {c.label}
              </th>
            ))}
            {FEATURE_GROUPS.map((g) => (
              <th key={g.label} colSpan={g.points.length} className={cx(th, "sticky top-0 z-20 border-l bg-surface-2 text-ink")}>
                {g.label} {g.points[0]}–{g.points[g.points.length - 1]} ({MEASUREMENT_UNIT})
              </th>
            ))}
          </tr>
          <tr>
            {FEATURE_GROUPS.flatMap((g) =>
              g.points.map((p, i) => (
                <th key={p} className={cx(th, "sticky z-20 bg-surface-2 text-center", i === 0 && "border-l")} style={{ top: HEAD1, minWidth: 56 }}>
                  {p}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sessionId} data-session={r.sessionId} className="hover:bg-surface-2">
              <td className={cx(stick, "border-b border-line px-3 py-2 whitespace-nowrap")} style={{ left: LEFT[0], minWidth: FIXED[0].w, maxWidth: FIXED[0].w }}>
                <LocalTime iso={r.startedAt} />
              </td>
              <td className={cx(stick, "truncate border-b border-line px-3 py-2")} style={{ left: LEFT[1], minWidth: FIXED[1].w, maxWidth: FIXED[1].w }}>
                {r.technician}
              </td>
              <td className={cx(stick, "truncate border-b border-line px-3 py-2")} style={{ left: LEFT[2], minWidth: FIXED[2].w, maxWidth: FIXED[2].w }}>
                {r.station}
              </td>
              <td className={cx(stick, "border-b border-r border-line px-3 py-2")} style={{ left: LEFT[3], minWidth: FIXED[3].w, maxWidth: FIXED[3].w }}>
                <Link href={`/dashboard/${r.sessionId}`} className="font-semibold text-primary-ink hover:underline">
                  Open
                </Link>
              </td>
              {FEATURE_GROUPS.flatMap((g) =>
                g.points.map((p, i) => {
                  const c = r.cells[p];
                  const corrected = !!c && c.earlier.length > 0;
                  return (
                    <td
                      key={p}
                      data-point={p}
                      data-corrected={corrected ? "1" : undefined}
                      title={corrected ? `Corrected. Earlier: ${c.earlier.join(", ")} ${MEASUREMENT_UNIT}` : r.demo && c ? "Demo value" : undefined}
                      className={cx("border-b border-line px-2 py-2 text-center tabular-nums whitespace-nowrap", i === 0 && "border-l", !c && "text-subtle")}
                    >
                      {c ? (
                        <>
                          {c.latest}
                          {corrected && <span aria-label="corrected" className="ml-0.5 inline-block size-1.5 rounded-full bg-amber align-top" data-testid="corrected-dot" />}
                          {r.demo && (
                            <sup aria-label="demo value" className="ml-0.5 text-[10px] font-bold text-amber-ink">
                              D
                            </sup>
                          )}
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
