import { requireApiUser } from "@/lib/auth/server";
import { parseRange, rangeStart } from "@/lib/dashboard/metrics";
import { parseShift } from "@/lib/dashboard/params";
import { errorResponse } from "@/lib/server/http";
import { SopRuleError } from "@/lib/server/sopData";
import { startReview } from "@/lib/server/sopReview";

/** "Review this way": builds the Draft and its suggestions from one candidate's checks. Quality Engineer or admin only. */
export async function POST(req: Request) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  if (typeof body.station !== "string" || typeof body.candidate !== "string") return Response.json({ error: "station and candidate are needed" }, { status: 400 });
  try {
    const result = await startReview(
      { id: user.id, name: user.name },
      { station: body.station, since: rangeStart(parseRange(body.range)), shift: parseShift(body.shift) },
      body.candidate,
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SopRuleError) {
      const revisionId = (e as { revisionId?: string }).revisionId;
      return Response.json({ error: e.message, ...(revisionId ? { revisionId } : {}) }, { status: revisionId ? 409 : 400 });
    }
    return errorResponse(e);
  }
}
