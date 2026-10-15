// Sign-in with Better Auth on our own tables (db/schema.ts), through the same connection as the rest of
// the app: Neon in production, the in-process Postgres when FL_STORAGE=memory.
// Better Auth's HTTP endpoints are not mounted. Sign-in and sign-out run as Server Actions
// (app/auth-actions.ts), so every attempt passes the rate limit and the role check.
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { memoryConnection, neonConnection, type Conn } from "@/db/client";
import * as t from "@/db/schema";
import { NotConfigured } from "@/lib/server/repo";
import { hashPassword, verifyPassword } from "./password";
import { MAX_SESSION_HOURS, SESSION_HOURS, canUse, isRole, type Area, type Role } from "./roles";
import { createUser, findUser } from "./users";

export class AuthNotConfigured extends Error {
  constructor() {
    super("AUTH_SECRET is not set on the server. See README: Sign-in.");
  }
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const memory = () => process.env.FL_STORAGE === "memory";

/** Signs the session cookie and keys the address hashes. At least 32 characters. */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (s && s.length >= 32) return s;
  // The in-process test database is thrown away after each run, so a fixed secret is harmless there.
  if (memory()) return "factorylens-memory-mode-only-secret-not-for-production";
  throw new AuthNotConfigured();
}

/** Secure cookies wherever the site is served over HTTPS (Vercel). Plain http://localhost cannot keep them. */
const secureCookies = () => process.env.VERCEL === "1" || (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");

export async function authConn(): Promise<Conn> {
  if (memory()) return memoryConnection();
  const c = neonConnection();
  if (!c) throw new NotConfigured();
  return c;
}

function build(conn: Conn) {
  const secure = secureCookies();
  return betterAuth({
    appName: "FactoryLens AI",
    secret: authSecret(),
    baseURL: process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
    database: drizzleAdapter(conn.db, {
      provider: "pg",
      schema: { users: t.users, authSessions: t.authSessions, authAccounts: t.authAccounts, authVerifications: t.authVerifications },
    }),
    user: {
      modelName: "users",
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "technician", input: false },
        disabled: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      modelName: "authSessions",
      // The cookie lasts as long as the longest role; the database row ends each session on time (see the hook).
      expiresIn: MAX_SESSION_HOURS * 3600,
      // A fixed length from sign-in: a session is never stretched by use.
      disableSessionRefresh: true,
    },
    account: { modelName: "authAccounts" },
    verification: { modelName: "authVerifications" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
    },
    // Our own limit (lib/auth/attempts.ts) is per account and address and kept in the database.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure },
    },
    databaseHooks: {
      session: {
        create: {
          // Quality Technician 12 hours, Quality Engineer 8 hours, from sign-in.
          before: async (session) => {
            const [u] = await conn.db.select({ role: t.users.role }).from(t.users).where(eq(t.users.id, session.userId));
            const hours = SESSION_HOURS[isRole(u?.role) ? u.role : "engineer"];
            return { data: { ...session, expiresAt: new Date(Date.now() + hours * 3_600_000) } };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof build>;

export function getAuth(): Promise<Auth> {
  const g = globalThis as unknown as { __flAuth?: Map<string, Promise<Auth>> };
  g.__flAuth ??= new Map();
  const key = memory() ? "memory" : "neon";
  let p = g.__flAuth.get(key);
  if (!p) {
    p = (async () => {
      authSecret(); // fail early and clearly
      const conn = await authConn();
      if (memory()) await seedTestUsers(conn);
      return build(conn);
    })();
    p.catch(() => g.__flAuth?.delete(key));
    g.__flAuth.set(key, p);
  }
  return p;
}

async function seedTestUsers(conn: Conn) {
  const { TEST_USERS } = await import("./testUsers");
  for (const u of TEST_USERS) {
    if (!(await findUser(conn.db, u.email))) await createUser(conn.db, u);
  }
}

/** The signed-in person behind these request headers, or null. Disabled people count as signed out. */
export async function userFromHeaders(h: Headers): Promise<CurrentUser | null> {
  const auth = await getAuth();
  const s = await auth.api.getSession({ headers: h });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: unknown; disabled?: unknown };
  if (u.disabled === true || !isRole(u.role)) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

/**
 * Once per request: who is signed in. The cookie header is rebuilt from cookies(), which already holds
 * a cookie set earlier in this request: after a sign-in from inside a check, the page re-renders in the
 * same request and must see the new sign-in, not the old (signed-out) request.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const h = new Headers(await headers());
  const jar = (await cookies()).toString();
  if (jar) h.set("cookie", jar);
  else h.delete("cookie");
  return userFromHeaders(h);
});

/**
 * For Route Handlers: the person may use this area, or a JSON error.
 * 401 when nobody is signed in, 403 when the role does not fit, 503 when sign-in is not set up.
 */
export async function requireApiUser(req: Request, area: Area): Promise<CurrentUser | Response> {
  let user: CurrentUser | null;
  try {
    user = await userFromHeaders(req.headers);
  } catch (e) {
    if (e instanceof AuthNotConfigured || e instanceof NotConfigured) return Response.json({ error: e.message }, { status: 503 });
    throw e;
  }
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canUse(user.role, area)) return Response.json({ error: "Not allowed for this role." }, { status: 403 });
  return user;
}
