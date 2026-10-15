// Creating and changing people. Used by the scripts (npm run user:*) and by the in-memory test database.
// No "server-only" here: the scripts import it.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AnyDb } from "@/db/client";
import * as t from "@/db/schema";
import { hashPassword } from "./password";
import type { Role } from "./roles";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findUser(db: AnyDb, email: string) {
  const [u] = await db.select().from(t.users).where(eq(t.users.email, normalizeEmail(email)));
  return u ?? null;
}

export async function createUser(db: AnyDb, p: { name: string; email: string; role: Role; password: string }) {
  const id = randomUUID();
  const now = new Date();
  const password = await hashPassword(p.password);
  await db.insert(t.users).values({ id, name: p.name.trim(), email: normalizeEmail(p.email), role: p.role, createdAt: now, updatedAt: now });
  // Better Auth keeps the password on a "credential" account.
  await db.insert(t.authAccounts).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password, createdAt: now, updatedAt: now });
  return id;
}

/** Sets a new password, turns the person back on, and ends their sessions everywhere. */
export async function resetPassword(db: AnyDb, userId: string, password: string) {
  const hashed = await hashPassword(password);
  const now = new Date();
  const updated = await db
    .update(t.authAccounts)
    .set({ password: hashed, updatedAt: now })
    .where(and(eq(t.authAccounts.userId, userId), eq(t.authAccounts.providerId, "credential")))
    .returning({ id: t.authAccounts.id });
  if (!updated.length) {
    await db.insert(t.authAccounts).values({ id: randomUUID(), accountId: userId, providerId: "credential", userId, password: hashed, createdAt: now, updatedAt: now });
  }
  await db.update(t.users).set({ disabled: false, updatedAt: now }).where(eq(t.users.id, userId));
  await db.delete(t.authSessions).where(eq(t.authSessions.userId, userId));
}

/** Cannot sign in any more; signed out everywhere at once. Their past sessions stay. */
export async function disableUser(db: AnyDb, userId: string) {
  await db.update(t.users).set({ disabled: true, updatedAt: new Date() }).where(eq(t.users.id, userId));
  await db.delete(t.authSessions).where(eq(t.authSessions.userId, userId));
}
