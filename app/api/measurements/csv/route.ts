import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { dashView } from "@/lib/server/dashView";
import { errorResponse } from "@/lib/server/http";
import { allMeasurements, parseMeasurementParams, toCsv } from "@/lib/server/measurements";

/** The measurements in a view as CSV, with the "not a validated record" note on every row. Quality Engineer or admin only. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  try {
    const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
    const { f } = await dashView({ ...sp, sample: "0" });
    const { step, source, sort, dir } = parseMeasurementParams(sp);
    const csv = toCsv(await allMeasurements({ f: { ...f, includeSample: false }, step, source, sort, dir }));
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
