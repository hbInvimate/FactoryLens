import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { SopRuleError } from "@/lib/server/sopData";import { confirmUpdate } from "@/lib/server/sopUpdate";

/** "Confirm and update SOP". Safe to send twice: only one revision is ever activated. Quality Engineer or admin only. */
export async function POST(req: Request, ctx: RouteContext<"/api/sop/update/[id]/confirm">) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  try {
    return Response.json({ ok: true, ...(await confirmUpdate({ id: user.id, name: user.name }, id)) });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}