import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { getRepo } from "@/lib/server/repo";
import { errorResponse } from "@/lib/server/http";
import { isSessionId } from "@/lib/server/validate";

/** The full action log of a session, used to resume it on any device. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/sessions/[id]">) {
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!isSessionId(id)) return Response.json({ error: "Not a session id" }, { status: 400 });
  try {
    const journal = await getRepo().journal(id);
    if (!journal) return Response.json({ error: "No such session" }, { status: 404 });
    return Response.json(journal);
  } catch (e) {
    return errorResponse(e);
  }
}
