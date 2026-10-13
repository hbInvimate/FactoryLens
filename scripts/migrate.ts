// Applies the SQL migrations in ./drizzle to the database in DATABASE_URL.
// Run with: npm run db:migrate
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Pull it with `vercel env pull .env.local`, or export it, then run again.");
  process.exit(1);
}

await migrate(drizzle(neon(url)), { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
