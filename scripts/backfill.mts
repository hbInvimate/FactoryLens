// npm run db:backfill: rebuilds the summary rows of every session from its own action log,
// so older sessions get what newer code stores (missed points, categories, check time). Safe to run twice.
import { getRepo } from "../lib/server/repo";

const repo = getRepo();
const sessions = await repo.list(100_000);
let n = 0;
for (const s of sessions) {
  const j = await repo.journal(s.id);
  if (!j) continue;
  await repo.save(j.meta, []);
  n++;
}
console.log(`Rebuilt ${n} sessions from their logs.`);
