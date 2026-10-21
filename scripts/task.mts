// Tasks for Quality Technicians, from the command line. Works on the database in DATABASE_URL.
//   npm run task:create   technician's email, part, station, priority, title (optional)
// The task shows on that Quality Technician's /tasks page as Not started. Same as + New Task on that page.
import { createInterface } from "node:readline/promises";
import { neonConnection } from "../db/client";
import * as t from "../db/schema";
import { findUser, normalizeEmail } from "../lib/auth/users";

const PRIORITIES = ["high", "medium", "low"];

const conn = neonConnection();
if (!conn) {
  console.error("DATABASE_URL is not set. Pull it with `vercel env pull .env.local`, or export it, then run again.");
  process.exit(1);
}
const { db } = conn;
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
const ask = async (q: string) => (await rl.question(q)).trim();

async function create() {
  const email = normalizeEmail(await ask("Quality Technician's email: "));
  const u = await findUser(db, email);
  if (!u) throw new Error(`No one with the email ${email}.`);
  if (u.role !== "technician") throw new Error(`${u.name} is not a Quality Technician.`);
  if (u.disabled) throw new Error(`${u.name} is disabled.`);
  const part = await ask("Part: ");
  if (!part || part.length > 120) throw new Error("The part must be 1 to 120 characters.");
  const station = await ask("Station (cell and fixture): ");
  if (station.length < 2 || station.length > 80) throw new Error("The station must be 2 to 80 characters.");
  const priority = ((await ask("Priority (high, medium, low) [medium]: ")) || "medium").toLowerCase();
  if (!PRIORITIES.includes(priority)) throw new Error("The priority must be high, medium or low.");
  const title = (await ask("Task title (leave empty for First-off check: <part>): ")) || `First-off check: ${part}`;
  if (title.length > 120) throw new Error("The title must be at most 120 characters.");
  const id = crypto.randomUUID();
  await db.insert(t.tasks).values({ id, title, part, station, priority, assignedTo: u.id, assignedName: u.name, createdBy: "task:create" });
  console.log(`\nCreated "${title}" for ${u.name}, ${priority} priority. It shows on their Tasks page as Not started.`);
}

try {
  if (process.argv[2] === "create") await create();
  else throw new Error("Use npm run task:create.");
} catch (e) {
  const msg = (e as Error).message;
  console.error(msg.includes("relation") && msg.includes("does not exist") ? "The tasks table is missing. Run npm run db:migrate first." : msg);
  process.exitCode = 1;
} finally {
  rl.close();
}
