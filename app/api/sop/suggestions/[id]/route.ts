import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { SopRuleError } from "@/lib/server/sopData";
import { actOnSuggestion, type SuggestionAction } from "@/lib/server/sopReview";

/** Accept, edit or reject one suggestion. Saved and audited. Quality Engineer or admin only. */
export async function POST(req: Request, ctx: RouteContext<"/api/sop/suggestions/[id]">) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "accept" && action !== "edit" && action !== "reject") return Response.json({ error: "action must be accept, edit or reject" }, { status: 400 });
  try {
    const result = await actOnSuggestion({ id: user.id, name: user.name }, id, action as SuggestionAction, typeof body.value === "string" ? body.value : undefined);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
