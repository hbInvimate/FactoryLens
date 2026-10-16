import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { SopRuleError } from "@/lib/server/sopData";import { proposeFromSession } from "@/lib/server/sopUpdate";

/** "Use this way": run the comparison on one check and keep the result as a Draft. Quality Engineer or admin only. */
export async function POST(req: Request) {
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  if (typeof body.sessionId !== "string") return Response.json({ error: "sessionId is needed" }, { status: 400 });
  try {
    return Response.json({ ok: true, ...(await proposeFromSession({ id: user.id, name: user.name }, body.sessionId)) });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}