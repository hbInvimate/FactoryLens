// Storage for sessions. Postgres (Neon, via Drizzle) in production.
// FL_STORAGE=memory gives a throwaway in-process store for tests and demos without a database.
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { project, type Projection, type SessionRow } from "@/lib/check/project";
import { sortActions } from "@/lib/check/reducer";
import type { Action, SessionMeta } from "@/lib/check/types";

export interface Journal {
  meta: SessionMeta;
  actions: Action[];
}

export interface SaveResult {
  saved: number;
  status: SessionRow["status"];
}

export interface Repo {
  readonly kind: "postgres" | "memory";
  save(meta: SessionMeta, actions: Action[]): Promise<SaveResult>;
  journal(id: string): Promise<Journal | null>;
  list(limit?: number): Promise<SessionRow[]>;
  detail(id: string): Promise<Projection | null>;
}

export class NotConfigured extends Error {
  constructor() {
    super("DATABASE_URL is not set. See README: Set up the database.");
  }
}

export function getRepo(): Repo {
  if (process.env.FL_STORAGE === "memory") return memoryRepo();
  const db = getDb();
  if (!db) throw new NotConfigured();
  return pgRepo(db);
}

// ---------- Postgres ----------

function toPayload(a: Action): Record<string, unknown> {
  const { id: _id, seq: _seq, at: _at, type: _type, ...rest } = a;
  return rest;
}

function fromRow(r: typeof t.sessionActions.$inferSelect): Action {
  return { ...(r.payload as object), id: r.id, seq: r.seq, at: r.at.getTime(), type: r.type } as Action;
}

function metaFromRow(r: typeof t.sessions.$inferSelect): SessionMeta {
  return { id: r.id, part: r.part, sop: r.sop, fixture: r.fixture, operator: r.operatorLabel, createdAt: r.startedAt.getTime() };
}

function pgRepo(db: Db): Repo {
  return {
    kind: "postgres",

    async save(meta, actions) {
      const now = new Date();
      // 1. Make sure the session exists, then append the new actions. Repeats are ignored (idempotent retries).
      await db
        .insert(t.sessions)
        .values({
          id: meta.id, startedAt: new Date(meta.createdAt), status: "running", part: meta.part, sop: meta.sop,
          fixture: meta.fixture, operatorLabel: meta.operator, updatedAt: now,
        })
        .onConflictDoNothing();
      if (actions.length) {
        await db
          .insert(t.sessionActions)
          .values(actions.map((a) => ({
            id: a.id, sessionId: meta.id, seq: a.seq, at: new Date(a.at), type: a.type, payload: toPayload(a),
          })))
          .onConflictDoNothing();
      }

      // 2. Rebuild the summary tables from the full log, in one batch.
      const [sessionRow] = await db.select().from(t.sessions).where(eq(t.sessions.id, meta.id));
      const rows = await db.select().from(t.sessionActions).where(eq(t.sessionActions.sessionId, meta.id));
      const p = project(metaFromRow(sessionRow), rows.map(fromRow), now.getTime());
      const { id: _id, ...sessionUpdate } = p.session;

      await db.batch([
        db.update(t.sessions).set(sessionUpdate).where(eq(t.sessions.id, meta.id)),
        db.delete(t.stepEvents).where(eq(t.stepEvents.sessionId, meta.id)),
        db.delete(t.pointConfirmations).where(eq(t.pointConfirmations.sessionId, meta.id)),
        db.delete(t.handoffItems).where(eq(t.handoffItems.sessionId, meta.id)),
        db.delete(t.discrepancies).where(eq(t.discrepancies.sessionId, meta.id)),
        ...(p.stepEvents.length ? [db.insert(t.stepEvents).values(p.stepEvents)] : []),
        ...(p.points.length ? [db.insert(t.pointConfirmations).values(p.points)] : []),
        ...(p.discrepancies.length ? [db.insert(t.discrepancies).values(p.discrepancies)] : []),
        ...(p.handoffs.length ? [db.insert(t.handoffItems).values(p.handoffs)] : []),
      ]);
      return { saved: actions.length, status: p.session.status };
    },

    async journal(id) {
      const [s] = await db.select().from(t.sessions).where(eq(t.sessions.id, id));
      if (!s) return null;
      const rows = await db
        .select()
        .from(t.sessionActions)
        .where(eq(t.sessionActions.sessionId, id))
        .orderBy(asc(t.sessionActions.seq));
      return { meta: metaFromRow(s), actions: rows.map(fromRow) };
    },

    async list(limit = 100) {
      const rows = await db.select().from(t.sessions).orderBy(desc(t.sessions.startedAt)).limit(limit);
      return rows.map((r) => ({ ...r, status: r.status as SessionRow["status"] }));
    },

    async detail(id) {
      const [s] = await db.select().from(t.sessions).where(eq(t.sessions.id, id));
      if (!s) return null;
      const [stepEvents, points, discrepancies, handoffs] = await Promise.all([
        db.select().from(t.stepEvents).where(eq(t.stepEvents.sessionId, id)).orderBy(asc(t.stepEvents.at)),
        db.select().from(t.pointConfirmations).where(eq(t.pointConfirmations.sessionId, id))
          .orderBy(asc(t.pointConfirmations.step), asc(t.pointConfirmations.sequence)),
        db.select().from(t.discrepancies).where(eq(t.discrepancies.sessionId, id)).orderBy(asc(t.discrepancies.loggedAt)),
        db.select().from(t.handoffItems).where(eq(t.handoffItems.sessionId, id)),
      ]);
      return {
        session: { ...s, status: s.status as SessionRow["status"] },
        stepEvents: stepEvents.map((e) => ({ ...e, kind: e.kind as Projection["stepEvents"][number]["kind"] })),
        points,
        discrepancies,
        handoffs,
      };
    },
  };
}

/** Used by the health check in the README. */
export async function pingDb(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await db.execute(sql`select 1`);
  return true;
}

// ---------- Memory (tests and demos only) ----------

interface MemoryStore {
  sessions: Map<string, { meta: SessionMeta; actions: Map<string, Action> }>;
}

function memoryRepo(): Repo {
  const g = globalThis as unknown as { __flMemory?: MemoryStore };
  g.__flMemory ??= { sessions: new Map() };
  const store = g.__flMemory;
  const proj = (id: string) => {
    const s = store.sessions.get(id);
    return s ? project(s.meta, [...s.actions.values()], Date.now()) : null;
  };

  return {
    kind: "memory",
    async save(meta, actions) {
      const s = store.sessions.get(meta.id) ?? { meta, actions: new Map<string, Action>() };
      store.sessions.set(meta.id, s);
      for (const a of actions) if (!s.actions.has(a.id)) s.actions.set(a.id, a);
      return { saved: actions.length, status: proj(meta.id)!.session.status };
    },
    async journal(id) {
      const s = store.sessions.get(id);
      return s ? { meta: s.meta, actions: sortActions([...s.actions.values()]) } : null;
    },
    async list(limit = 100) {
      return [...store.sessions.keys()]
        .map((id) => proj(id)!.session)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit);
    },
    async detail(id) {
      return proj(id);
    },
  };
}
