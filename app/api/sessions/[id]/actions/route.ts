import type { NextRequest } from "next/server";
import { NOT_OWNER_ERROR, canOpenSession } from "@/lib/auth/roles";
import { requireApiUser } from "@/lib/auth/server";
import { runnableRevisionId } from "@/lib/server/sop";
import { getRepo } from "@/lib/server/repo";
import { errorResponse } from "@/lib/server/http";
import { BadRequest, isSessionId, parseActions, parseMeta } from "@/lib/server/validate";

/**
 * Appends queued actions to a session (creating it on first save) and rebuilds its summary rows.
 * Safe to retry: actions already stored are ignored.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/sessions/[id]/actions">) {
  // Anonymous writes get 401; a Quality Engineer gets 403. The browser keeps the work and retries after sign-in.
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
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
    // Tests only: with the in-process database (FL_STORAGE=memory) a test may save a sample session.
    // Against Neon this header is ignored: only `npm run db:seed-sample` creates sample data.
    const sample = process.env.FL_STORAGE === "memory" && req.headers.get("x-fl-sample") === "1";
    const repo = getRepo();
    const existing = await repo.ownerOf(id);
    if (existing.exists && !canOpenSession(user, existing.ownerId)) {
      return Response.json({ error: NOT_OWNER_ERROR, code: "not_owner" }, { status: 403 });
    }
    // A new session is stored as the signed-in person's, under their name. Sample sessions belong to no one.
    // The SOP revision the check started on, if a check may run on it (never a draft). Only used for a new session.
    const sopRevisionId = existing.exists ? null : await runnableRevisionId(meta.sopRevisionId, await repo.conn());
    const result = await repo.save(meta, actions, sample ? { sample: true, sopRevisionId } : { owner: { id: user.id, name: user.name }, sopRevisionId });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
