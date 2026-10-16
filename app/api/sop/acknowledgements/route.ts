import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { acknowledge } from "@/lib/server/sopActivate";
import { SopRuleError } from "@/lib/server/sopData";

/** "I have read this" on the "SOP rev B is active" banner. Quality Technician or admin. */
export async function POST(req: Request) {
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  if (typeof body.revisionId !== "string") return Response.json({ error: "revisionId is needed" }, { status: 400 });
  try {
    await acknowledge({ id: user.id, name: user.name }, body.revisionId);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof SopRuleError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
