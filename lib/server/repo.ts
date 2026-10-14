// Storage for sessions. Postgres (Neon, via Drizzle) in production.
// FL_STORAGE=memory gives a throwaway in-process store for tests and demos without a database.
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { categoryOf } from "@/lib/issues";
import { getDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { activeSecondsOf, project, stationOf, type Projection, type SessionRow } from "@/lib/check/project";
import { reduce, sortActions } from "@/lib/check/reducer";
import type { Action, SessionMeta } from "@/lib/check/types";
import { SESSION_DEFAULTS } from "@/lib/sop";

export interface Journal {
  meta: SessionMeta;
  actions: Action[];
}

export interface SaveResult {
  saved: number;
  status: SessionRow["status"];
}

/** A session as the dashboard needs it. */
export interface DashRow extends SessionRow {
  /** Lodged discrepancies not yet cleared, released or scrapped. */
  openDiscrepancies: number;
  /** The oldest open hold: why the session or the cell is on hold. */
  hold: HoldInfo | null;
  isSample: boolean;
}

export interface SaveOptions {
  /** Only the sample-data script sets this. Browsers cannot. */
  sample?: boolean;
}

export interface HoldInfo {
  step: number;
  issue: string;
  category: string;
  effect: string;
  who: string[];
  startedAt: Date;
}

function oldestHold(rows: { step: number; issueLabel: string; category: string | null; effect: string; whoToCall: string[]; loggedAt: Date; status: string }[]): HoldInfo | null {
  const open = rows.filter((r) => OPEN.includes(r.status)).sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const h = open[0];
  return h
    ? { step: h.step, issue: h.issueLabel, category: h.category ?? categoryOf(h.step, h.issueLabel), effect: h.effect, who: h.whoToCall, startedAt: h.loggedAt }
    : null;
}

export interface Repo {
  readonly kind: "postgres" | "memory";
  save(meta: SessionMeta, actions: Action[], opts?: SaveOptions): Promise<SaveResult>;
  journal(id: string): Promise<Journal | null>;
  list(limit?: number): Promise<SessionRow[]>;
  detail(id: string): Promise<Projection | null>;
  /** Stations from the list, plus any station older sessions were saved with. Sorted by name. */
  stations(): Promise<string[]>;
  addStation(name: string): Promise<string>;
  /** Sessions at one station started on or after `since` (all if null), newest first. */
  dashboard(station: string, since: Date | null, includeSample: boolean): Promise<DashRow[]>;
  /** How many real and sample sessions exist. */
  counts(): Promise<{ real: number; sample: number }>;
  /** Deletes every sample session and everything under it. Real sessions are never touched. */
  clearSample(): Promise<number>;
}

export const SEED_STATION = SESSION_DEFAULTS.fixture;

const OPEN = ["open", "escalated"];

function byName(a: string, b: string) {
  return a.localeCompare(b);
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
  const rest: Record<string, unknown> = { ...a };
  for (const k of ["id", "seq", "at", "type"]) delete rest[k];
  return rest;
}

function fromRow(r: typeof t.sessionActions.$inferSelect): Action {
  return { ...(r.payload as object), id: r.id, seq: r.seq, at: r.at.getTime(), type: r.type } as Action;
}

function metaFromRow(r: typeof t.sessions.$inferSelect): SessionMeta {
  return {
    id: r.id, part: r.part, sop: r.sop, fixture: r.fixture, operator: r.operatorLabel, createdAt: r.startedAt.getTime(),
    ...(r.station ? { station: r.station } : {}),
  };
}

const stationExpr = sql<string>`coalesce(${t.sessions.station}, btrim(${t.sessions.fixture}))`;

function pgRepo(db: Db): Repo {
  return {
    kind: "postgres",

    async save(meta, actions, opts) {
      const now = new Date();
      // 1. Make sure the session exists, then append the new actions. Repeats are ignored (idempotent retries).
      await db
        .insert(t.sessions)
        .values({
          id: meta.id, startedAt: new Date(meta.createdAt), status: "running", part: meta.part, sop: meta.sop,
          fixture: meta.fixture, station: stationOf(meta), operatorLabel: meta.operator, updatedAt: now,
          isSample: opts?.sample === true,
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
      const sessionUpdate: Partial<SessionRow> = { ...p.session };
      delete sessionUpdate.id;

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

    async stations() {
      const [listed, used] = await Promise.all([
        db.select({ name: t.stations.name }).from(t.stations),
        db.selectDistinct({ name: stationExpr }).from(t.sessions),
      ]);
      return [...new Set([SEED_STATION, ...listed.map((r) => r.name), ...used.map((r) => r.name)])].sort(byName);
    },

    async addStation(name) {
      await db.insert(t.stations).values({ name }).onConflictDoNothing();
      return name;
    },

    async dashboard(station, since, includeSample) {
      const where = and(
        eq(stationExpr, station),
        since ? gte(t.sessions.startedAt, since) : undefined,
        includeSample ? undefined : sql`coalesce(${t.sessions.isSample}, false) = false`,
      );
      const rows = await db.select().from(t.sessions).where(where).orderBy(desc(t.sessions.startedAt));
      if (!rows.length) return [];
      const ids = rows.map((r) => r.id);
      const open = await db
        .select()
        .from(t.discrepancies)
        .where(and(inArray(t.discrepancies.sessionId, ids), inArray(t.discrepancies.status, OPEN)));
      const openBy = new Map<string, typeof open>();
      for (const o of open) openBy.set(o.sessionId, [...(openBy.get(o.sessionId) ?? []), o]);

      // Sessions saved before check time was stored: work it out from their log.
      const missing = rows.filter((r) => r.activeSeconds === null && r.conformance !== null);
      const filled = new Map<string, number | null>();
      if (missing.length) {
        const acts = await db.select().from(t.sessionActions).where(inArray(t.sessionActions.sessionId, missing.map((r) => r.id)));
        for (const r of missing) {
          const s = reduce(acts.filter((a) => a.sessionId === r.id).map(fromRow), r.startedAt.getTime());
          filled.set(r.id, activeSecondsOf(s));
        }
      }
      return rows.map((r) => ({
        ...r,
        status: r.status as SessionRow["status"],
        activeSeconds: r.activeSeconds ?? filled.get(r.id) ?? null,
        openDiscrepancies: openBy.get(r.id)?.length ?? 0,
        hold: oldestHold(openBy.get(r.id) ?? []),
        isSample: r.isSample === true,
      }));
    },

    async counts() {
      const [r] = await db
        .select({
          real: sql<number>`count(*) filter (where coalesce(${t.sessions.isSample}, false) = false)`,
          sample: sql<number>`count(*) filter (where ${t.sessions.isSample} = true)`,
        })
        .from(t.sessions);
      return { real: Number(r?.real ?? 0), sample: Number(r?.sample ?? 0) };
    },

    async clearSample() {
      // Cascades to actions, step events, point confirmations, discrepancies and handoff items.
      const gone = await db.delete(t.sessions).where(eq(t.sessions.isSample, true)).returning({ id: t.sessions.id });
      return gone.length;
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
  sessions: Map<string, { meta: SessionMeta; actions: Map<string, Action>; sample?: boolean }>;
  stations?: Set<string>;
}

function memoryRepo(): Repo {
  const g = globalThis as unknown as { __flMemory?: MemoryStore };
  g.__flMemory ??= { sessions: new Map() };
  g.__flMemory.stations ??= new Set([SEED_STATION]);
  const stationSet = g.__flMemory.stations;
  const store = g.__flMemory;
  const proj = (id: string) => {
    const s = store.sessions.get(id);
    return s ? project(s.meta, [...s.actions.values()], Date.now()) : null;
  };

  return {
    kind: "memory",
    async save(meta, actions, opts) {
      const s = store.sessions.get(meta.id) ?? { meta, actions: new Map<string, Action>(), sample: opts?.sample === true };
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
    async stations() {
      const used = [...store.sessions.values()].map((s) => stationOf(s.meta));
      return [...new Set([...stationSet, ...used])].sort(byName);
    },
    async addStation(name) {
      stationSet.add(name);
      return name;
    },
    async dashboard(station, since, includeSample) {
      return [...store.sessions.entries()]
        .filter(([, s]) => includeSample || !s.sample)
        .map(([id, s]) => ({ p: proj(id)!, sample: s.sample === true }))
        .filter(({ p }) => p.session.station === station && (!since || p.session.startedAt >= since))
        .sort((a, b) => b.p.session.startedAt.getTime() - a.p.session.startedAt.getTime())
        .map(({ p, sample }) => ({
          ...p.session,
          openDiscrepancies: p.discrepancies.filter((d) => OPEN.includes(d.status)).length,
          hold: oldestHold(p.discrepancies),
          isSample: sample,
        }));
    },
    async counts() {
      const all = [...store.sessions.values()];
      return { real: all.filter((s) => !s.sample).length, sample: all.filter((s) => s.sample).length };
    },
    async clearSample() {
      let n = 0;
      for (const [id, s] of store.sessions) {
        if (s.sample) {
          store.sessions.delete(id);
          n++;
        }
      }
      return n;
    },
  };
}
