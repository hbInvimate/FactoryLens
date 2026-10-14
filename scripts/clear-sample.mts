// npm run db:clear-sample: removes only the rows flagged is_sample. Safe to run twice.
import { getRepo } from "../lib/server/repo";
import { clearSample } from "../lib/sample/seed";

const removed = await clearSample(getRepo());
console.log(`Removed ${removed} sample sessions. Real sessions are untouched.`);
