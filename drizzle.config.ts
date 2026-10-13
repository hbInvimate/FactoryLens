import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes SQL to ./drizzle. `npm run db:migrate` applies it (scripts/migrate.ts).
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
