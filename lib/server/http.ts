import { BadRequest } from "./validate";
import { NotConfigured } from "./repo";

/** The Postgres error under Drizzle's "Failed query" wrapper, if there is one. */
function dbCause(e: unknown): { code?: string; message: string } | null {
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.message ? { code: cause.code, message: cause.message } : null;
}

/** Turns known failures into clear JSON errors. The browser keeps unsaved work and retries. */
export function errorResponse(e: unknown): Response {
  if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof NotConfigured) return Response.json({ error: e.message }, { status: 503 });
  const cause = dbCause(e);
  // Log the real database error, not only the query Drizzle wraps it in.
  console.error(cause ? `Database error${cause.code ? ` ${cause.code}` : ""}: ${cause.message}` : e);
  if (cause?.code === "42P01") {
    return Response.json({ error: "The database tables are missing. Run npm run db:migrate." }, { status: 503 });
  }
  return Response.json({ error: "The server could not save." }, { status: 500 });
}
