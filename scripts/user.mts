// People who can sign in. Works on the database in DATABASE_URL.
//   npm run user:create           name, email, role, password (or a generated one-time password)
//   npm run user:reset-password   new password; signs the person out everywhere
//   npm run user:disable          cannot sign in any more; signed out everywhere
// Passwords are typed here or shown once on screen. They are never written to a file or the log.
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { neonConnection } from "../db/client";
import { MIN_PASSWORD_LENGTH, generatePassword } from "../lib/auth/password";
import { ROLES, ROLE_LABEL, isRole, type Role } from "../lib/auth/roles";
import { createUser, disableUser, findUser, normalizeEmail, resetPassword } from "../lib/auth/users";

const command = process.argv[2];
const conn = neonConnection();
if (!conn) {
  console.error("DATABASE_URL is not set. Pull it with `vercel env pull .env.local`, or export it, then run again.");
  process.exit(1);
}
const { db } = conn;

// Typed passwords are not echoed.
let muted = false;
const out = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) process.stdout.write(chunk);
    cb();
  },
});
const rl = createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY === true });

// Answers are read line by line, so they can be typed or piped in (all at once).
const lines = rl[Symbol.asyncIterator]();
async function nextLine(): Promise<string> {
  const next = await lines.next();
  if (next.done) throw new Error("No answer given. Run it again and answer every question.");
  return next.value;
}

async function ask(q: string): Promise<string> {
  process.stdout.write(q);
  const a = (await nextLine()).trim();
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return a;
}

async function askHidden(q: string): Promise<string> {
  process.stdout.write(q);
  muted = true;
  try {
    return await nextLine();
  } finally {
    muted = false;
    process.stdout.write("\n");
  }
}

/** A typed password (twice), or a generated one-time password when left empty. */
async function askPassword(): Promise<{ password: string; generated: boolean }> {
  for (;;) {
    const p = await askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters; leave empty to generate a one-time password): `);
    if (!p) return { password: generatePassword(), generated: true };
    if (p.length < MIN_PASSWORD_LENGTH) {
      console.log(`Too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      continue;
    }
    if ((await askHidden("Type it again: ")) !== p) {
      console.log("The two passwords are different. Try again.");
      continue;
    }
    return { password: p, generated: false };
  }
}

function showOnce(password: string) {
  console.log("\nOne-time password (shown once, not stored anywhere; give it to the person directly):\n");
  console.log(`    ${password}\n`);
}

async function existing(): Promise<NonNullable<Awaited<ReturnType<typeof findUser>>>> {
  const email = normalizeEmail(await ask("Email: "));
  const u = await findUser(db, email);
  if (!u) {
    console.error(`No one with the email ${email}.`);
    process.exit(1);
  }
  return u;
}

async function create() {
  const name = await ask("Full name: ");
  if (!name) throw new Error("A name is needed.");
  const email = normalizeEmail(await ask("Email: "));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That is not an email address.");
  if (await findUser(db, email)) throw new Error(`${email} already exists. Use npm run user:reset-password to change the password.`);
  const roleText = (await ask(`Role (${ROLES.map((r) => `${r} = ${ROLE_LABEL[r]}`).join(", ")}): `)).toLowerCase();
  if (!isRole(roleText)) throw new Error(`The role must be one of: ${ROLES.join(", ")}.`);
  const role: Role = roleText;
  const { password, generated } = await askPassword();
  await createUser(db, { name, email, role, password });
  console.log(`\nCreated ${name} <${email}>, ${ROLE_LABEL[role]}.`);
  console.log(role === "engineer" ? "Signs in at /dashboard/signin (the dashboard)." : role === "technician" ? "Signs in at /signin." : role === "supervisor" ? "Signs in at /supervisor/signin (read-only on every session)." : "Signs in at /signin or /dashboard/signin.");
  if (generated) showOnce(password);
}

async function reset() {
  const u = await existing();
  const { password, generated } = await askPassword();
  await resetPassword(db, u.id, password);
  console.log(`\nNew password set for ${u.name} <${u.email}>. They are signed out everywhere${u.disabled ? " and can sign in again" : ""}.`);
  if (generated) showOnce(password);
}

async function disable() {
  const u = await existing();
  if ((await ask(`Type the email again to disable ${u.name}: `)).toLowerCase() !== u.email) throw new Error("Not disabled: the email did not match.");
  await disableUser(db, u.id);
  console.log(`\n${u.name} <${u.email}> is disabled and signed out everywhere. Their past checks stay. npm run user:reset-password turns them back on.`);
}

try {
  if (command === "create") await create();
  else if (command === "reset-password") await reset();
  else if (command === "disable") await disable();
  else throw new Error("Use npm run user:create, npm run user:reset-password or npm run user:disable.");
} catch (e) {
  const msg = (e as Error).message;
  console.error(msg.includes("relation") && msg.includes("does not exist") ? "The sign-in tables are missing. Run npm run db:migrate first." : msg);
  process.exitCode = 1;
} finally {
  rl.close();
}
