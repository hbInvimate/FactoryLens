import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { SopRuleError, saveCtDecision } from "@/lib/server/sopData";

/**
 * The Quality Engineer's CT decision for one step, saved in the Draft revision with its evidence and an
 * audit entry. Quality Engineer or admin only: 401 signed out, 403 for a Quality Technician.
 */
export async function POST(req: Request) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  try {
    const ids = Array.isArray(body.evidenceSessionIds) ? body.evidenceSessionIds.filter((x): x is string => typeof x === "string") : [];
    const result = await saveCtDecision(
      { id: user.id, name: user.name },
      {
        step: Number(body.step),
        newCtSeconds: Number(body.newCtSeconds),
        reason: typeof body.reason === "string" ? body.reason : "",
        confirmed: body.confirmed === true,
        evidenceSessionIds: ids,
        overrideReason: typeof body.overrideReason === "string" ? body.overrideReason : undefined,
      },
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
