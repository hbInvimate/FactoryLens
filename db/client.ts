import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let db: Db | null = null;

/** DATABASE_URL comes from the environment only (Vercel Marketplace: Neon). */
export function getDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  db ??= drizzle(neon(url), { schema });
  return db;
}
