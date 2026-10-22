// npm run demo:seed / demo:clear, and the Team figures built from them. Runs in-process on PGlite (FL_STORAGE=memory).
import { expect, test } from "@playwright/test";
import { like } from "drizzle-orm";
import * as t from "../db/schema";
import { clearDemo, seedDemo } from "../lib/sample/demo";
import { DEMO_EMAIL_DOMAIN } from "../lib/sample/demoUsers";
import { generateSample } from "../lib/sample/generate";
import { getRepo } from "../lib/server/repo";
import { sortTeam, tagOf, team } from "../lib/server/supervisor";

process.env.FL_STORAGE = "memory";

test.describe.configure({ mode: "serial" });

test("tag rules: Top at 95% or more; Coach below 85% or with 4+ deviations; else On track", () => {
  expect(tagOf(95, 0)).toBe("top");
  expect(tagOf(100, 3)).toBe("top");
  expect(tagOf(100, 4)).toBe("coach");
  expect(tagOf(84, 0)).toBe("coach");
  expect(tagOf(85, 0)).toBe("on_track");
  expect(tagOf(94, 3)).toBe("on_track");
  expect(tagOf(null, 0)).toBeNull();
  expect(tagOf(null, 5)).toBe("coach");
});

test("demo:seed adds 5 demo people with checks, twice is the same; demo:clear removes only them", async () => {
  const repo = getRepo();
  const { db } = await repo.conn();
  // Something that must stay: a sample session from db:seed-sample.
  const other = generateSample()[0];
  await repo.save(other.meta, other.actions, { sample: true });

  const first = await seedDemo(repo);
  expect(first.people).toBe(5);
  expect(first.added).toBe(first.checks);
  const again = await seedDemo(repo);
  expect(again).toEqual({ ...first, added: 0 });
  expect(await db.select().from(t.users).where(like(t.users.email, `%@${DEMO_EMAIL_DOMAIN}`))).toHaveLength(5);

  // The Team page figures: every demo person, with real tags from their checks.
  const four = await team("4w");
  const demo = four.members.filter((m) => m.demo);
  expect(demo).toHaveLength(5);
  const by = Object.fromEntries(demo.map((m) => [m.name.split(" ")[0], m]));
  expect(by.Asha.tag).toBe("top");
  expect(by.Asha.deviations).toBe(0);
  expect(by.Dev.tag).toBe("coach");
  expect(by.Dev.note).toMatch(/^Top deviation: step 7 skipped \(\d+×\)$/);
  expect(by.Asha.note).toMatch(/^Slowest vs target: step \d+ \(\d+% of target\)$/);
  expect(four.totals.coach).toBeGreaterThanOrEqual(1);
  expect(sortTeam(demo, "ftr")[0].name).toBe("Asha Patel (demo)");
  for (const m of demo) expect(m.avgSeconds).not.toBeNull();
  // Most have checks this week too (unless the week has only just begun).
  const week = await team("week");
  expect(week.members.filter((m) => m.demo)).toHaveLength(5);

  const gone = await clearDemo(repo);
  expect(gone).toEqual({ people: 5, checks: first.checks });
  expect(await db.select().from(t.users).where(like(t.users.email, `%@${DEMO_EMAIL_DOMAIN}`))).toHaveLength(0);
  expect((await repo.journal(other.meta.id))?.meta.id).toBe(other.meta.id);
  expect(await clearDemo(repo)).toEqual({ people: 0, checks: 0 });
});
