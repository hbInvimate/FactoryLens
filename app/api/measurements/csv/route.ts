import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { dashView } from "@/lib/server/dashView";
import { errorResponse } from "@/lib/server/http";
import { WIDE_LIMIT, allMeasurements, parseMeasurementParams, toCsv, toWideCsv, wideMeasurements } from "@/lib/server/measurements";

/** The measurements as CSV: the line view (default, one row per check) or the list. The "not a validated record" note is on every row. Quality Engineer or admin only. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  try {
    const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
    const { f } = await dashView({ ...sp, sample: "0" });
    const { step, source, sort, dir } = parseMeasurementParams(sp);
    let csv: string;
    if (sp.view === "list") {
      csv = toCsv(await allMeasurements({ f: { ...f, includeSample: false }, step, source, sort, dir }));
    } else {
      // "All values in a line": one row per check, the same wide layout as the page.
      const { count, rows } = await wideMeasurements(f, source);
      if (!rows) return Response.json({ error: `${count} checks. Narrow the date range (at most ${WIDE_LIMIT}).` }, { status: 400 });
      csv = toWideCsv(rows);
    }
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="measurements-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
