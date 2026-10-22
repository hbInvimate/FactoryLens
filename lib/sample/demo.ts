// npm run demo:seed / demo:clear: 5 DEMO Quality Technicians with sample checks over the last 4 weeks, for showing the
// Supervisor pages. Every demo person has an email at DEMO_EMAIL_DOMAIN and "(demo)" in the name; every demo check
// is a sample session (is_sample) owned by one of them. Both are safe to run twice; clearing touches nothing else.
import { inArray, like } from "drizzle-orm";
import * as t from "@/db/schema";
import { createUser } from "@/lib/auth/users";
import type { SessionMeta } from "@/lib/check/types";
import type { Repo } from "@/lib/server/repo";
import { SESSION_DEFAULTS } from "@/lib/sop";
import { DEMO_EMAIL_DOMAIN } from "./demoUsers";
import { build, rng, type Plan } from "./generate";

export const DEMO_ID_PREFIX = "demo-";

const H = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `H${from + i}`);
const clean: Plan = { kind: "clean" };
const skipHoles: Plan = { kind: "skip", step: 7, missing: H(9, 12) };
const skipTrim: Plan = { kind: "skip", step: 9, missing: ["T7"] };
const skipVisual: Plan = { kind: "skip", step: 11, missing: ["V2", "V3"] };
const clamps: Plan = { kind: "clamp", step: 5, tapped: "C4", expected: "C3" };

/** Five people, from very good to needing coaching. `pace` scales every step's time (1 = about 45 minutes). */
const PEOPLE: { key: string; name: string; pace: number; plans: Plan[] }[] = [
  { key: "asha", name: "Asha Patel (demo)", pace: 0.82, plans: Array(14).fill(clean) },
  { key: "ben", name: "Ben Okafor (demo)", pace: 0.9, plans: [clean, clean, skipTrim, ...Array(9).fill(clean)] },
  { key: "carla", name: "Carla Mendes (demo)", pace: 1.02, plans: [clean, clamps, clean, clean, clean, clean, skipTrim, clean, clean, clean] },
  { key: "dev", name: "Dev Sharma (demo)", pace: 0.95, plans: [skipHoles, clean, skipHoles, clamps, clean, skipHoles, clean, skipHoles, clean, clean, clamps, clean] },
  { key: "elena", name: "Elena Rossi (demo)", pace: 1.12, plans: [skipVisual, clean, clean, skipVisual, clean, clamps, clean, clean] },
];

const DAY = 86_400_000;

function mondayOf(now: number): number {
  const m = new Date(now);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m.getTime();
}

/** When check i of n starts: the first three this week (when the week has room), the rest over the 3 weeks before. */
function startOf(now: number, i: number, n: number, r: () => number): number {
  const latest = now - 90 * 60_000; // finished by now
  const monday = mondayOf(now);
  if (i < 3 && latest - monday > 3 * 3_600_000) return latest - Math.floor(((i + r() * 0.5) / 3) * (latest - monday));
  const daysAgo = 7 + ((i - 3) * 20) / Math.max(1, n - 3) + r();
  return latest - Math.floor(daysAgo * DAY);
}

export async function seedDemo(repo: Repo, now: number = Date.now()): Promise<{ people: number; checks: number; added: number }> {
  const { db } = await repo.conn();
  let checks = 0;
  let added = 0;
  for (const [k, p] of PEOPLE.entries()) {
    const email = `${p.key}@${DEMO_EMAIL_DOMAIN}`;
    const [found] = await db.select({ id: t.users.id }).from(t.users).where(inArray(t.users.email, [email]));
    // A random password nobody is shown: demo people never sign in.
    const id = found?.id ?? (await createUser(db, { name: p.name, email, role: "technician", password: crypto.randomUUID() }));
    const r = rng(20261022 + k);
    for (const [i, plan] of p.plans.entries()) {
      const sid = `${DEMO_ID_PREFIX}${p.key}-${String(i + 1).padStart(2, "0")}`;
      const [exists] = await db.select({ id: t.sessions.id }).from(t.sessions).where(inArray(t.sessions.id, [sid]));
      checks += 1;
      if (exists) continue;
      const createdAt = startOf(now, i, p.plans.length, r);
      const meta: SessionMeta = { id: sid, part: SESSION_DEFAULTS.part, sop: SESSION_DEFAULTS.sop, fixture: SESSION_DEFAULTS.fixture, station: SESSION_DEFAULTS.fixture, operator: p.name, createdAt };
      await repo.save(meta, build(sid, createdAt, plan, {}, p.pace, r), { sample: true, owner: { id, name: p.name } });
      added += 1;
    }
  }
  return { people: PEOPLE.length, checks, added };
}

/** Removes the demo people and their checks (cascades to everything under them). Nothing else. */
export async function clearDemo(repo: Repo): Promise<{ people: number; checks: number }> {
  const { db } = await repo.conn();
  const people = await db.select({ id: t.users.id }).from(t.users).where(like(t.users.email, `%@${DEMO_EMAIL_DOMAIN}`));
  if (!people.length) return { people: 0, checks: 0 };
  const ids = people.map((p) => p.id);
  const gone = await db.delete(t.sessions).where(inArray(t.sessions.userId, ids)).returning({ id: t.sessions.id });
  await db.delete(t.users).where(inArray(t.users.id, ids));
  return { people: ids.length, checks: gone.length };
}
