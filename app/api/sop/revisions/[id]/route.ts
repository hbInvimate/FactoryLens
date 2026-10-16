import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { reviewData } from "@/lib/server/sopReview";

/** One revision: its 12 steps, the suggestions and the clip references. Quality Engineer or admin only. */
export async function GET(req: Request, ctx: RouteContext<"/api/sop/revisions/[id]">) {
  await connection();
  const user = await requireApiUser(req, "dashboard");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  try {
    const data = await reviewData(id);
    if (!data) return Response.json({ error: "No such revision" }, { status: 404 });
    return Response.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
