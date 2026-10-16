import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { SopRuleError } from "@/lib/server/sopData";import { discardUpdate } from "@/lib/server/sopUpdate";

/** "Discard": the SOP does not change. Quality Engineer or admin only. */
export async function POST(req: Request, ctx: RouteContext<"/api/sop/update/[id]/discard">) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  try {
    await discardUpdate({ id: user.id, name: user.name }, id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}