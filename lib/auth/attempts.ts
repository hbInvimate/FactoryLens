// Login rate limit: 5 failed attempts per 15 minutes per account and address, kept in the database
// so it holds across server instances. The address is stored as a keyed hash, never as typed.
import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { AnyDb } from "@/db/client";
import * as t from "@/db/schema";
import { LOGIN_LIMIT } from "./roles";

/** The browser's address, as Vercel (or the local server) reports it. */
export function clientAddress(h: Headers): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

export function addressHash(address: string, secret: string): string {
  return createHmac("sha256", secret).update(address).digest("hex").slice(0, 32);
}

const windowStart = () => new Date(Date.now() - LOGIN_LIMIT.minutes * 60_000);

export async function isLocked(db: AnyDb, email: string, addr: string): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.loginAttempts)
    .where(and(eq(t.loginAttempts.email, email), eq(t.loginAttempts.addressHash, addr), gt(t.loginAttempts.at, windowStart())));
  return Number(r?.n ?? 0) >= LOGIN_LIMIT.attempts;
}

export async function recordFailure(db: AnyDb, email: string, addr: string): Promise<void> {
  await db.insert(t.loginAttempts).values({ id: randomUUID(), email, addressHash: addr, at: new Date() });
  // Keep the table small: anything older than a day no longer counts.
  await db.delete(t.loginAttempts).where(lt(t.loginAttempts.at, new Date(Date.now() - 86_400_000)));
}

/** A successful sign-in clears the count for that account and address. */
export async function clearFailures(db: AnyDb, email: string, addr: string): Promise<void> {
  await db.delete(t.loginAttempts).where(and(eq(t.loginAttempts.email, email), eq(t.loginAttempts.addressHash, addr)));
}
