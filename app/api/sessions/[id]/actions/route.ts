import type { NextRequest } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { errorResponse } from "@/lib/server/http";
import { BadRequest, isSessionId, parseActions, parseMeta } from "@/lib/server/validate";

/**
 * Appends queued actions to a session (creating it on first save) and rebuilds its summary rows.
 * Safe to retry: actions already stored are ignored.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/sessions/[id]/actions">) {
  const { id } = await ctx.params;
  try {
    if (!isSessionId(id)) throw new BadRequest("Not a session id");
    const text = await req.text();
    if (text.length > 1_000_000) throw new BadRequest("Too much in one save");
    let body: { meta?: unknown; actions?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      throw new BadRequest("Body is not JSON");
    }
    const meta = parseMeta(body.meta, id);
    const actions = parseActions(body.actions);
    const result = await getRepo().save(meta, actions);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
