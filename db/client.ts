import path from "node:path";
import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;
/** Any Postgres database Drizzle can talk to: Neon in production, PGlite in tests. */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Runs a list of writes together: one Neon batch, or one after the other on PGlite. */
export type Batch = (queries: PromiseLike<unknown>[]) => Promise<void>;

export interface Conn {
  db: AnyDb;
  batch: Batch;
}

let neonConn: Conn | null = null;

/** DATABASE_URL comes from the environment only (Vercel Marketplace: Neon). */
export function getDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return getNeon(url).db as unknown as Db;
}

function getNeon(url: string): Conn {
  if (!neonConn) {
    const db = drizzle(neon(url), { schema });
    neonConn = {
      db: db as unknown as AnyDb,
      batch: async (qs) => {
        if (qs.length) await db.batch(qs as unknown as Parameters<typeof db.batch>[0]);
      },
    };
  }
  return neonConn;
}

export function neonConnection(): Conn | null {
  const url = process.env.DATABASE_URL;
  return url ? getNeon(url) : null;
}

/**
 * FL_STORAGE=memory: a real Postgres (PGlite) inside this process, migrated from ./drizzle.
 * Tests and demos run the same SQL as production, and nothing touches Neon.
 */
export function memoryConnection(): Promise<Conn> {
  const g = globalThis as unknown as { __flPglite?: Promise<Conn> };
  g.__flPglite ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const db = drizzlePglite(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    return {
      db: db as unknown as AnyDb,
      batch: async (qs) => {
        for (const q of qs) await q;
      },
    };
  })();
  return g.__flPglite;
}
