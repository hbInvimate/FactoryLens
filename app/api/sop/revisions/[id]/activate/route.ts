import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { activate } from "@/lib/server/sopActivate";
import { SopRuleError } from "@/lib/server/sopData";

/**
 * "Make this the primary way" (kind primary, a Draft) or "Make this revision active again" (kind rollback,
 * a Retired revision). A reason is required. Quality Engineer or admin only.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/sop/revisions/[id]/activate">) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const kind = body.kind === "rollback" ? "rollback" : "primary";
  try {
    const result = await activate({ id: user.id, name: user.name }, id, typeof body.reason === "string" ? body.reason : "", kind);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
