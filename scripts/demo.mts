// npm run demo:seed: 5 DEMO Quality Technicians with sample checks over the last 4 weeks (Supervisor pages).
// npm run demo:clear: removes only them and their checks. Both work on DATABASE_URL and are safe to run twice.
import { getRepo } from "../lib/server/repo";
import { clearDemo, seedDemo } from "../lib/sample/demo";
import { DEMO_EMAIL_DOMAIN } from "../lib/sample/demoUsers";

const repo = getRepo();
if (process.argv[2] === "seed") {
  const { people, checks, added } = await seedDemo(repo);
  console.log(`Demo: ${people} Quality Technicians (@${DEMO_EMAIL_DOMAIN}), ${checks} checks (${added} added). Real data is untouched.`);
} else if (process.argv[2] === "clear") {
  const { people, checks } = await clearDemo(repo);
  console.log(`Removed ${people} demo Quality Technicians and ${checks} demo checks. Real data is untouched.`);
} else {
  console.error("Use npm run demo:seed or npm run demo:clear.");
  process.exitCode = 1;
}
