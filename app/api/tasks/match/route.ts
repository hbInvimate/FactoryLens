import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { activeMatch } from "@/lib/server/tasks";

/** The start page asks first: ?part=&station= gives the same check already In progress, or such a task Not started. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
  try {
    const u = new URL(req.url);
    const part = (u.searchParams.get("part") ?? "").slice(0, 120);
    const station = (u.searchParams.get("station") ?? "").slice(0, 80);
    return Response.json({ match: part && station ? await activeMatch(user, part, station) : null });
  } catch (e) {
    return errorResponse(e);
  }
}
