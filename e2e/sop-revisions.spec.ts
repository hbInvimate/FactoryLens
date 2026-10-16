// SOP management, stage 1: revisions in the database, same behaviour.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AnyDb, Conn } from "../db/client";
import * as schema from "../db/schema";
import { activeRevision, revisionIdOf, runnableRevisionId, runnableRevisions } from "../lib/server/sop";
import { STEPS } from "../lib/sop";
import { CODE_REVISION, PLACEHOLDER_TARGET_SECONDS, REV_A_ID, checkTargetSeconds, sopName, stepOf } from "../lib/sop-revisions";
import { startCheck } from "./helpers";

const DRIZZLE = path.join(process.cwd(), "drizzle");

/** A fresh in-process Postgres, optionally migrated. */
async function fresh(migrated = true): Promise<{ pg: PGlite; conn: Conn }> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  if (migrated) await migrate(db, { migrationsFolder: DRIZZLE });
  return { pg, conn: { db: db as unknown as AnyDb, batch: async (qs) => void (await Promise.all(qs)) } };
}

test.describe("revisions in the database (no browser)", () => {
  test("revision A in the database matches lib/sop.ts word for word, and is Active", async () => {
    const { pg, conn } = await fresh();
    const rev = await activeRevision(conn);
    expect(rev.id).toBe(REV_A_ID);
    expect(rev.label).toBe("A");
    expect(rev.steps).toHaveLength(12);
    expect(rev.steps).toEqual(CODE_REVISION.steps);
    STEPS.forEach((s, i) => {
      const r = rev.steps[i];
      expect([r.todo, r.correct, r.mistake, r.rule, r.spoken]).toEqual([s.todo, s.correct, s.mistake, s.rule, s.spoken]);
      expect(r.referenceNote).toBeNull();
      expect(r.targetCtSeconds).toBe(PLACEHOLDER_TARGET_SECONDS[i]);
    });
    // The merged step keeps names and check points from code.
    expect(stepOf(rev, 7)).toMatchObject({ name: STEPS[6].name, points: STEPS[6].points, spoken: STEPS[6].spoken });
    // Placeholder targets (drizzle/0008): 45:00 for the whole check.
    expect(checkTargetSeconds(rev)).toBe(45 * 60);
    expect(sopName(rev.label)).toBe("First-off check, rev A");
    const { rows } = await pg.query<{ n: number }>(`select count(*)::int as n from sop_audit where action = 'seed_baseline'`);
    const n = rows[0].n;
    expect(n).toBe(1);
  });

  test("the fallback: no revisions, or no tables at all, gives lib/sop.ts", async () => {
    const empty = await fresh(false); // tables missing, as before the migration
    expect(await activeRevision(empty.conn)).toEqual(CODE_REVISION);
    expect(await runnableRevisions(empty.conn)).toEqual([CODE_REVISION]);
    expect(await runnableRevisionId(REV_A_ID, empty.conn)).toBeNull();

    const none = await fresh();
    await none.pg.exec(`update sop_revisions set status = 'retired'`); // no Active revision
    expect(await activeRevision(none.conn)).toEqual(CODE_REVISION);
  });

  test("only revisions a check may run on are stored on a session; older sessions count as revision A", async () => {
    const { pg, conn } = await fresh();
    expect(await runnableRevisionId(REV_A_ID, conn)).toBe(REV_A_ID);
    expect(await runnableRevisionId("not-a-revision", conn)).toBeNull();
    await pg.exec(`insert into sop_revisions (id, label, status, scope) values ('draft-x', 'X', 'draft', 'First-off check, B-pillar outer')`);
    expect(await runnableRevisionId("draft-x", conn)).toBeNull(); // a draft is never run
    expect(await runnableRevisionId(undefined, conn)).toBeNull();
    expect(revisionIdOf(null)).toBe(REV_A_ID);
    expect(revisionIdOf(undefined)).toBe(REV_A_ID);
  });

  test("every migration from 0004 on runs twice without error and without duplicating revision A", async () => {
    const { pg } = await fresh();
    const files = readdirSync(DRIZZLE).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= 4).sort();
    expect(files).toContain("0006_sop_revisions.sql");
    for (const f of files) {
      for (const stmt of readFileSync(path.join(DRIZZLE, f), "utf8").split("--> statement-breakpoint")) {
        if (stmt.trim()) await pg.exec(stmt);
      }
    }
    const count = async (q: string) => ((await pg.query<{ n: number }>(q)).rows[0].n);
    expect(await count(`select count(*)::int as n from sop_revisions`)).toBe(1);
    expect(await count(`select count(*)::int as n from sop_step_revisions`)).toBe(12);
    expect(await count(`select count(*)::int as n from sop_audit`)).toBe(1);
    expect(await count(`select count(*)::int as n from sop_revisions where status = 'active'`)).toBe(1);
  });
});

test("a new check stores the Active revision; the start page says rev A", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByText("SOP: First-off check, rev A, 12 steps.", { exact: false })).toBeVisible();
  const id = await startCheck(page);
  await page.getByRole("button", { name: "Done, next step", exact: true }).click();
  await expect(page.getByTestId("connection")).toHaveText("Connected");
  const journal = await (await request.get(`/api/sessions/${id}`)).json();
  expect(journal.meta.sopRevisionId).toBe(REV_A_ID);
  expect(journal.meta.sop).toBe("First-off check, rev A");
  // The step text on screen comes from the revision, the same words as lib/sop.ts.
  await page.locator("li[aria-current=step]").getByRole("button", { name: "Step details" }).click();
  await expect(page.getByText(STEPS[1].todo)).toBeVisible();
});

test("a session saved with an unknown revision id is stored without one (counts as revision A)", async ({ request }) => {
  const id = crypto.randomUUID();
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: "Laser cell 3 · FX-014", operator: "x", createdAt: Date.now(), sopRevisionId: "made-up-rev" };
  expect((await request.post(`/api/sessions/${id}/actions`, { data: { meta, actions: [] } })).ok()).toBeTruthy();
  const journal = await (await request.get(`/api/sessions/${id}`)).json();
  expect(journal.meta.sopRevisionId).toBeUndefined();
});
