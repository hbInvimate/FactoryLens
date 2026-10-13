import { BadRequest } from "./validate";
import { NotConfigured } from "./repo";

/** Turns known failures into clear JSON errors. The browser keeps unsaved work and retries. */
export function errorResponse(e: unknown): Response {
  if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof NotConfigured) return Response.json({ error: e.message }, { status: 503 });
  console.error(e);
  return Response.json({ error: "The server could not save. Your work is kept on this device." }, { status: 500 });
}
