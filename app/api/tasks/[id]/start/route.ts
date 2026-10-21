import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { startTask } from "@/lib/server/tasks";

/** Opening a Not started task: { sessionId } of the check the browser just created for it. */
export async function POST(req: Request, ctx: RouteContext<"/api/tasks/[id]/start">) {
  await connection();
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { sessionId?: unknown } | null;
    const r = await startTask(user, id, body?.sessionId);
    return r.ok ? Response.json({ sessionId: r.sessionId }) : Response.json({ error: r.error, sessionId: r.sessionId }, { status: r.status });
  } catch (e) {
    return errorResponse(e);
  }
}