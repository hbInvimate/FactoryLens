import { connection } from "next/server";
import { seesAllSessions } from "@/lib/auth/roles";
import { requireApiUser } from "@/lib/auth/server";
import { getRepo } from "@/lib/server/repo";
import { errorResponse } from "@/lib/server/http";

/** Session history, newest first: a Quality Technician's own sessions; an admin's view has them all. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
  try {
    const sessions = await getRepo().list(200, seesAllSessions(user.role) ? {} : { userId: user.id });
    return Response.json({ sessions });
  } catch (e) {
    return errorResponse(e);
  }
}
