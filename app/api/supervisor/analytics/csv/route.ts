import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { DEVIATION_LABEL, analytics, analyticsFilter } from "@/lib/server/supervisor";

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The four Analytics charts as one CSV, for the same weeks and station. Supervisor or admin only. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "supervisor");
  if (user instanceof Response) return user;
  try {
    const f = analyticsFilter(Object.fromEntries(new URL(req.url).searchParams.entries()));
    const a = await analytics(f);
    const rows: (string | number | null)[][] = [
      ["Chart", "Item", "Value", "Target seconds", "Checks", "Station"],
      ...a.weeks.map((w) => ["First-time right per week (%)", `Week of ${w.start}`, w.ftrPct, null, w.completed, f.station ?? "All stations"]),
      ...a.steps.map((s) => ["Average time per step (seconds)", `${s.step}. ${s.name}`, s.avgSeconds, s.targetSeconds, s.sessions, f.station ?? "All stations"]),
      ...a.deviations.map((d) => ["Most common deviations (count)", `Step ${d.step} ${DEVIATION_LABEL[d.kind]}`, d.count, null, null, f.station ?? "All stations"]),
      ...a.byStation.map((s) => ["Discrepancies by station (count)", s.station, s.count, null, null, s.station]),
    ];
    return new Response(rows.map((r) => r.map(cell).join(",")).join("\n") + "\n", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="analytics-${f.weeks}-weeks-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
