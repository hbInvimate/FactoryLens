import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { getRepo } from "@/lib/server/repo";
import { errorResponse } from "@/lib/server/http";

/** Session history, newest first. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
  try {
    const sessions = await getRepo().list(200);
    return Response.json({ sessions });
  } catch (e) {
    return errorResponse(e);
  }
}
