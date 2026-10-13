import { connection } from "next/server";
import { getRepo } from "@/lib/server/repo";
import { errorResponse } from "@/lib/server/http";

/** Session history, newest first. */
export async function GET() {
  await connection();
  try {
    const sessions = await getRepo().list(200);
    return Response.json({ sessions });
  } catch (e) {
    return errorResponse(e);
  }
}
