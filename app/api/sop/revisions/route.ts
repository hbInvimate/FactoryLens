import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { auditLog, revisions } from "@/lib/server/sopData";

/** Every SOP revision with its CT decisions, and the audit log. Quality Engineer or admin only. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  try {
    const [revs, audit] = await Promise.all([revisions(), auditLog()]);
    return Response.json({ revisions: revs, audit });
  } catch (e) {
    return errorResponse(e);
  }
}
