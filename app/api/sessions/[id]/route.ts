import type { NextRequest } from "next/server";
import { canOpenSession } from "@/lib/auth/roles";
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
    // Someone else's check looks the same as one that does not exist.
    if (!journal || !canOpenSession(user, journal.ownerId)) return Response.json({ error: "No such session" }, { status: 404 });
    return Response.json({ meta: journal.meta, actions: journal.actions });
  } catch (e) {
    return errorResponse(e);
  }
}
