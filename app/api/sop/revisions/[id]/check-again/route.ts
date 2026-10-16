import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { checkAgain } from "@/lib/server/sopActivate";
import { SopRuleError } from "@/lib/server/sopData";

/** Optional "Check again" for a Draft. Saved with it; never blocks activation. Quality Engineer or admin only. */
export async function POST(req: Request, ctx: RouteContext<"/api/sop/revisions/[id]/check-again">) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  if (typeof body.station !== "string" || !body.station) return Response.json({ error: "station is needed" }, { status: 400 });
  try {
    return Response.json({ ok: true, result: await checkAgain({ id: user.id, name: user.name }, id, body.station) });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
