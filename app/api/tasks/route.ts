import { connection } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { errorResponse } from "@/lib/server/http";
import { createTask, listTasks } from "@/lib/server/tasks";

/** The signed-in Quality Technician's tasks; an admin's view has them all. */
export async function GET(req: Request) {
  await connection();
  const user = await requireApiUser(req, "check");
  if (user instanceof Response) return user;
  try {
    return Response.json({ tasks: await listTasks(user) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** New Task: { title?, part, station, priority, assignedTo }. Supervisors and admins only, not Quality Technicians. */
export async function POST(req: Request) {
  await connection();
  const user = await requireApiUser(req, "supervisor");
  if (user instanceof Response) return user;
  try {
    const id = await createTask(user, await req.json().catch(() => null));
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}