// Seed and clear the sample sessions. Both are safe to run twice:
// seeding uses fixed ids and saves are idempotent; clearing only deletes rows flagged is_sample.
import type { Repo } from "@/lib/server/repo";
import { generateSample } from "./generate";

export async function seedSample(repo: Repo, now: number = Date.now()): Promise<{ total: number; before: number }> {
  const before = (await repo.counts()).sample;
  for (const s of generateSample(now)) {
    await repo.save(s.meta, s.actions, { sample: true });
  }
  return { total: (await repo.counts()).sample, before };
}

export async function clearSample(repo: Repo): Promise<number> {
  return repo.clearSample();
}
