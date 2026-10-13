import { connection } from "next/server";
import { errorResponse } from "@/lib/server/http";
import { getRepo } from "@/lib/server/repo";
import { BadRequest, parseStationName } from "@/lib/server/validate";

/** Stations for the start form and the dashboard. */
export async function GET() {
  await connection();
  try {
    return Response.json({ stations: await getRepo().stations() });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Adds a station ("Add a station" on the start form). Adding one that exists is fine. */
export async function POST(req: Request) {
  try {
    let body: { name?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new BadRequest("Body is not JSON");
    }
    const name = await getRepo().addStation(parseStationName(body.name));
    return Response.json({ name });
  } catch (e) {
    return errorResponse(e);
  }
}
