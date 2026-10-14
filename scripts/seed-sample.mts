// npm run db:seed-sample: about 60 FAKE sessions for showing the dashboard. Safe to run twice.
import { getRepo } from "../lib/server/repo";
import { seedSample } from "../lib/sample/seed";

const repo = getRepo();
const { total, before } = await seedSample(repo);
console.log(`Sample sessions: ${total} (${total - before} added). Real sessions are untouched.`);
