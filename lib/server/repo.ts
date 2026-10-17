// Storage for sessions: Postgres via Drizzle. Neon in production.
// FL_STORAGE=memory runs the same code on PGlite, a Postgres inside the process, for tests and demos.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { categoryOf } from "@/lib/issues";
import { getDb, memoryConnection, neonConnection, type Conn } from "@/db/client";
import * as t from "@/db/schema";
import { activeSecondsOf, project, stationOf, type Projection, type SessionRow } from "@/lib/check/project";
import { reduce } from "@/lib/check/reducer";
import type { Action, SessionMeta } from "@/lib/check/types";
import { SESSION_DEFAULTS } from "@/lib/sop";
import { DEVIATION_KINDS, sessionWhere, stationExpr, type DashFilter } from "./sqlparts";

export type { DashFilter } from "./sqlparts";

export interface Journal {
  meta: SessionMeta;
  actions: Action[];
  /** users.id of the person who started it; null for older sessions and sample data. */
  ownerId: string | null;
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
  /**
   * The signed-in person saving it. A new session is stored as theirs, with their name as the
   * Quality Technician label, whatever the browser sent. An existing session keeps its owner and label.
   */
  owner?: { id: string; name: string };
  /**
   * The checked SOP revision for a new session (see lib/server/sop.ts runnableRevisionId). Null: counts as
   * revision A. An existing session keeps the revision it started on.
   */
  sopRevisionId?: string | null;
}

export interface HoldInfo {
  step: number;
  issue: string;
  category: string;
  effect: string;
  who: string[];
  startedAt: Date;
}

export interface DashboardOptions {
  /** Only sessions with a deviation (skipped, wrong order, cannot do) at this step. */
  devStep?: number | null;
  /** At most this many rows, newest first. */
  limit?: number;
}

export interface Repo {
  readonly kind: "postgres" | "memory";
  /** The database connection, for the dashboard queries. */
  conn(): Promise<Conn>;
  save(meta: SessionMeta, actions: Action[], opts?: SaveOptions): Promise<SaveResult>;
  journal(id: string): Promise<Journal | null>;
  /** Newest first. `includeSample: false` leaves out sessions from db:seed-sample; `userId` keeps only that person's. */
  list(limit?: number, opts?: { includeSample?: boolean; userId?: string }): Promise<SessionRow[]>;
  /** Whether the session exists, and whose it is. */
  ownerOf(id: string): Promise<{ exists: boolean; ownerId: string | null }>;
  detail(id: string): Promise<Projection | null>;
  /** Stations from the list, plus any station older sessions were saved with. Sorted by name. */
  stations(): Promise<string[]>;
  addStation(name: string): Promise<string>;
  /** Sessions in a dashboard view, newest first, and how many there are in all. */
  dashboard(f: DashFilter, opts?: DashboardOptions): Promise<{ rows: DashRow[]; total: number }>;
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

function oldestHold(rows: { step: number; issueLabel: string; category: string | null; effect: string; whoToCall: string[]; loggedAt: Date; status: string }[]): HoldInfo | null {
  const open = rows.filter((r) => OPEN.includes(r.status)).sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const h = open[0];
  return h
    ? { step: h.step, issue: h.issueLabel, category: h.category ?? categoryOf(h.step, h.issueLabel), effect: h.effect, who: h.whoToCall, startedAt: h.loggedAt }
    : null;
}

export class NotConfigured extends Error {
  constructor() {
    super("DATABASE_URL is not set. See README: Set up the database.");
  }
}

export function getRepo(): Repo {
  if (process.env.FL_STORAGE === "memory") return pgRepo(memoryConnection, "memory");
  const c = neonConnection();
  if (!c) throw new NotConfigured();
  return pgRepo(async () => c, "postgres");
}

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
    ...(r.sopRevisionId ? { sopRevisionId: r.sopRevisionId } : {}),
  };
}

function pgRepo(connect: () => Promise<Conn>, kind: Repo["kind"]): Repo {
  return {
    kind,
    conn: connect,

    async save(meta, actions, opts) {
      const { db, batch } = await connect();
      const now = new Date();
      // 1. Make sure the session exists, then append the new actions. Repeats are ignored (idempotent retries).
      await db
        .insert(t.sessions)
        .values({
          id: meta.id, startedAt: new Date(meta.createdAt), status: "running", part: meta.part, sop: meta.sop,
          fixture: meta.fixture, station: stationOf(meta), operatorLabel: opts?.owner?.name ?? meta.operator, updatedAt: now,
          isSample: opts?.sample === true, userId: opts?.owner?.id ?? null, sopRevisionId: opts?.sopRevisionId ?? null,
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

      // 2. Rebuild the summary tables from the full log, together.
      const [sessionRow] = await db.select().from(t.sessions).where(eq(t.sessions.id, meta.id));
      const rows = await db.select().from(t.sessionActions).where(eq(t.sessionActions.sessionId, meta.id));
      const p = project(metaFromRow(sessionRow), rows.map(fromRow), now.getTime());
      const sessionUpdate: Partial<SessionRow> = { ...p.session };
      delete sessionUpdate.id;

      await batch([
        db.update(t.sessions).set(sessionUpdate).where(eq(t.sessions.id, meta.id)),
        db.delete(t.stepEvents).where(eq(t.stepEvents.sessionId, meta.id)),
        db.delete(t.pointConfirmations).where(eq(t.pointConfirmations.sessionId, meta.id)),
        db.delete(t.handoffItems).where(eq(t.handoffItems.sessionId, meta.id)),
        db.delete(t.measurements).where(eq(t.measurements.sessionId, meta.id)),
        db.delete(t.discrepancies).where(eq(t.discrepancies.sessionId, meta.id)),
        ...(p.stepEvents.length ? [db.insert(t.stepEvents).values(p.stepEvents)] : []),
        ...(p.points.length ? [db.insert(t.pointConfirmations).values(p.points)] : []),
        ...(p.discrepancies.length ? [db.insert(t.discrepancies).values(p.discrepancies)] : []),
        ...(p.handoffs.length ? [db.insert(t.handoffItems).values(p.handoffs)] : []),
        ...(p.measurements.length ? [db.insert(t.measurements).values(p.measurements)] : []),
      ]);
      return { saved: actions.length, status: p.session.status };
    },

    async journal(id) {
      const { db } = await connect();
      const [s] = await db.select().from(t.sessions).where(eq(t.sessions.id, id));
      if (!s) return null;
      const rows = await db
        .select()
        .from(t.sessionActions)
        .where(eq(t.sessionActions.sessionId, id))
        .orderBy(asc(t.sessionActions.seq));
      return { meta: metaFromRow(s), actions: rows.map(fromRow), ownerId: s.userId ?? null };
    },

    async list(limit = 100, opts = {}) {
      const { db } = await connect();
      const rows = await db
        .select()
        .from(t.sessions)
        .where(
          and(
            opts.includeSample === false ? sql`coalesce(${t.sessions.isSample}, false) = false` : undefined,
            opts.userId ? eq(t.sessions.userId, opts.userId) : undefined,
          ),
        )
        .orderBy(desc(t.sessions.startedAt))
        .limit(limit);
      return rows.map((r) => ({ ...r, status: r.status as SessionRow["status"] }));
    },

    async ownerOf(id) {
      const { db } = await connect();
      const [s] = await db.select({ userId: t.sessions.userId }).from(t.sessions).where(eq(t.sessions.id, id));
      return { exists: !!s, ownerId: s?.userId ?? null };
    },

    async detail(id) {
      const { db } = await connect();
      const [s] = await db.select().from(t.sessions).where(eq(t.sessions.id, id));
      if (!s) return null;
      const [stepEvents, points, discrepancies, handoffs, measurements] = await Promise.all([
        db.select().from(t.stepEvents).where(eq(t.stepEvents.sessionId, id)).orderBy(asc(t.stepEvents.at)),
        db.select().from(t.pointConfirmations).where(eq(t.pointConfirmations.sessionId, id))
          .orderBy(asc(t.pointConfirmations.step), asc(t.pointConfirmations.sequence)),
        db.select().from(t.discrepancies).where(eq(t.discrepancies.sessionId, id)).orderBy(asc(t.discrepancies.loggedAt)),
        db.select().from(t.handoffItems).where(eq(t.handoffItems.sessionId, id)),
        db.select().from(t.measurements).where(eq(t.measurements.sessionId, id)).orderBy(asc(t.measurements.step), asc(t.measurements.recordedAt)),
      ]);
      return {
        session: { ...s, status: s.status as SessionRow["status"] },
        stepEvents: stepEvents.map((e) => ({ ...e, kind: e.kind as Projection["stepEvents"][number]["kind"] })),
        points,
        discrepancies,
        handoffs,
        measurements,
      };
    },

    async stations() {
      const { db } = await connect();
      const [listed, used] = await Promise.all([
        db.select({ name: t.stations.name }).from(t.stations),
        db.selectDistinct({ name: stationExpr }).from(t.sessions),
      ]);
      return [...new Set([SEED_STATION, ...listed.map((r) => r.name), ...used.map((r) => r.name)])].sort(byName);
    },

    async addStation(name) {
      const { db } = await connect();
      await db.insert(t.stations).values({ name }).onConflictDoNothing();
      return name;
    },

    async dashboard(f, opts = {}) {
      const { db } = await connect();
      const where = and(
        sessionWhere(f),
        opts.devStep
          ? sql`exists (select 1 from ${t.stepEvents} se where se.session_id = ${t.sessions.id} and se.step = ${opts.devStep}
              and se.kind in (${sql.join(DEVIATION_KINDS.map((k) => sql`${k}`), sql`, `)}))`
          : undefined,
      );
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(t.sessions).where(where);
      const rows = await db.select().from(t.sessions).where(where).orderBy(desc(t.sessions.startedAt)).limit(opts.limit ?? 200);
      if (!rows.length) return { rows: [], total: Number(total) };
      const ids = rows.map((r) => r.id);
      const open = await db
        .select()
        .from(t.discrepancies)
        .where(and(inArray(t.discrepancies.sessionId, ids), inArray(t.discrepancies.status, OPEN)));
      const openBy = new Map<string, typeof open>();
      for (const o of open) openBy.set(o.sessionId, [...(openBy.get(o.sessionId) ?? []), o]);

      // Complete sessions saved before check time was stored: work it out from their log.
      const missing = rows.filter((r) => r.activeSeconds === null && r.status === "complete");
      const filled = new Map<string, number | null>();
      if (missing.length) {
        const acts = await db.select().from(t.sessionActions).where(inArray(t.sessionActions.sessionId, missing.map((r) => r.id)));
        for (const r of missing) {
          const s = reduce(acts.filter((a) => a.sessionId === r.id).map(fromRow), r.startedAt.getTime());
          filled.set(r.id, activeSecondsOf(s));
        }
      }
      return {
        total: Number(total),
        rows: rows.map((r) => ({
          ...r,
          status: r.status as SessionRow["status"],
          activeSeconds: r.activeSeconds ?? filled.get(r.id) ?? null,
          openDiscrepancies: openBy.get(r.id)?.length ?? 0,
          hold: oldestHold(openBy.get(r.id) ?? []),
          isSample: r.isSample === true,
        })),
      };
    },

    async counts() {
      const { db } = await connect();
      const [r] = await db
        .select({
          real: sql<number>`count(*) filter (where coalesce(${t.sessions.isSample}, false) = false)`,
          sample: sql<number>`count(*) filter (where ${t.sessions.isSample} = true)`,
        })
        .from(t.sessions);
      return { real: Number(r?.real ?? 0), sample: Number(r?.sample ?? 0) };
    },

    async clearSample() {
      const { db } = await connect();
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
