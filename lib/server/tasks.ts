// Tasks: first-off checks to do, on the Quality Technician's /tasks page. A task's status is never stored:
// it follows the check started from it, so the check logic stays the only source of truth.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AnyDb } from "@/db/client";
import * as t from "@/db/schema";
import { readsAllSessions, seesAllSessions, type Role } from "@/lib/auth/roles";
import type { SessionStatus } from "@/lib/check/types";
import { getRepo } from "./repo";
import { shown } from "./supervisor";
import { stationExpr } from "./sqlparts";
import { BadRequest } from "./validate";

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

export const TASK_STATUSES = ["not_started", "in_progress", "completed", "closed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Closed",
};

export interface Task {
  /** "task": assigned (npm run task:create, or the tasks API for a Supervisor or admin). "check": started without a task (older checks). */
  kind: "task" | "check";
  /** The task id, or for a "check" the session id. */
  id: string;
  title: string;
  part: string;
  station: string;
  /** Null for a "check": it has no priority. */
  priority: Priority | null;
  assignedTo: string;
  assignedName: string;
  createdAt: string;
  sessionId: string | null;
  status: TaskStatus;
  /** The check's status, when it has reached the server. */
  sessionStatus: SessionStatus | null;
  /** Active time of the check (see durationMs). Null before it started. */
  durationSeconds: number | null;
}

/** Running, paused or on hold: in progress. Finished: completed. Ended without a completed check: closed. */
export function taskStatus(sessionId: string | null, s: SessionStatus | null): TaskStatus {
  if (!sessionId) return "not_started";
  if (!s || s === "running" || s === "paused" || s === "on_hold") return "in_progress"; // not saved yet: in progress
  return s === "complete" ? "completed" : "closed";
}

type Viewer = { id: string; role: Role };

/** A Quality Technician's own tasks; an admin's or Supervisor's view has them all. Newest first. */
export async function listTasks(user: Viewer): Promise<Task[]> {
  const { db } = await getRepo().conn();
  const rows = await db
    .select({ task: t.tasks, status: t.sessions.status, duration: t.sessions.durationSeconds })
    .from(t.tasks)
    .leftJoin(t.sessions, eq(t.sessions.id, t.tasks.sessionId))
    .where(readsAllSessions(user.role) ? undefined : eq(t.tasks.assignedTo, user.id))
    .orderBy(desc(t.tasks.createdAt))
    .limit(500);
  return rows.map(({ task: r, status, duration }) => ({
    kind: "task" as const,
    id: r.id,
    title: r.title,
    part: r.part,
    station: r.station,
    priority: (PRIORITIES as readonly string[]).includes(r.priority) ? (r.priority as Priority) : "medium",
    assignedTo: r.assignedTo,
    assignedName: r.assignedName,
    createdAt: r.createdAt.toISOString(),
    sessionId: r.sessionId,
    status: taskStatus(r.sessionId, (status as SessionStatus | null) ?? null),
    sessionStatus: (status as SessionStatus | null) ?? null,
    durationSeconds: duration ?? null,
  }));
}

/**
 * Checks started without a task (before checks could only start from one): a Quality Technician's own; an admin's or Supervisor's view
 * has every real one (and the demo people's, see supervisor.ts). Newest first.
 */
export async function listOwnChecks(user: Viewer): Promise<Task[]> {
  const { db } = await getRepo().conn();
  const rows = await db
    .select({ s: t.sessions })
    .from(t.sessions)
    .leftJoin(t.tasks, eq(t.tasks.sessionId, t.sessions.id))
    .where(and(isNull(t.tasks.id), readsAllSessions(user.role) ? shown : eq(t.sessions.userId, user.id)))
    .orderBy(desc(t.sessions.startedAt))
    .limit(500);
  return rows.map(({ s }) => {
    const status = s.status as SessionStatus;
    return {
      kind: "check" as const,
      id: s.id,
      title: `First-off check: ${s.part}`,
      part: s.part,
      station: s.station ?? s.fixture,
      priority: null,
      assignedTo: s.userId ?? "",
      assignedName: s.operatorLabel,
      createdAt: s.startedAt.toISOString(),
      sessionId: s.id,
      status: taskStatus(s.id, status),
      sessionStatus: status,
      durationSeconds: s.durationSeconds ?? null,
    };
  });
}

/** Quality Technicians a task can be given to (for an admin's New Task form). */
export async function technicians(): Promise<{ id: string; name: string }[]> {
  const { db } = await getRepo().conn();
  return db
    .select({ id: t.users.id, name: t.users.name })
    .from(t.users)
    .where(and(eq(t.users.role, "technician"), eq(t.users.disabled, false)))
    .orderBy(t.users.name);
}

function text(v: unknown, name: string, min: number, max: number): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) throw new BadRequest(`${name} must be ${min} to ${max} characters`);
  return s;
}

export const DUPLICATE_TASK = "This check is already assigned and not started";

/**
 * The start page's duplicate block: the signed-in Quality Technician's check for the same part and cell/fixture that
 * is already In progress (open it), else such a task still Not started (start that one). Null: start a new check.
 */
export async function activeMatch(user: Viewer, part: string, station: string): Promise<{ kind: "check"; sessionId: string } | { kind: "task"; taskId: string; title: string } | null> {
  const { db } = await getRepo().conn();
  const same = (col: unknown, v: string) => sql`lower(btrim(${col})) = lower(btrim(${v}))`;
  const [checks, tasks] = await Promise.all([
    db
      .select({ id: t.sessions.id })
      .from(t.sessions)
      .where(and(eq(t.sessions.userId, user.id), inArray(t.sessions.status, ["running", "paused", "on_hold", "stopped"]), same(t.sessions.part, part), same(stationExpr, station)))
      .orderBy(desc(t.sessions.startedAt))
      .limit(1),
    db
      .select({ id: t.tasks.id, title: t.tasks.title })
      .from(t.tasks)
      .where(and(eq(t.tasks.assignedTo, user.id), isNull(t.tasks.sessionId), same(t.tasks.part, part), same(t.tasks.station, station)))
      .orderBy(t.tasks.createdAt)
      .limit(1),
  ]);
  if (checks[0]) return { kind: "check", sessionId: checks[0].id };
  if (tasks[0]) return { kind: "task", taskId: tasks[0].id, title: tasks[0].title };
  return null;
}

/**
 * Whether the Quality Technician already has a Not started or In progress task for the same part and cell/fixture
 * (compared without case or extra spaces). Used by the tasks API and npm run task:create.
 */
export async function hasActiveDuplicate(db: AnyDb, assignedTo: string, part: string, station: string): Promise<boolean> {
  const rows = await db
    .select({ sessionId: t.tasks.sessionId, status: t.sessions.status })
    .from(t.tasks)
    .leftJoin(t.sessions, eq(t.sessions.id, t.tasks.sessionId))
    .where(
      and(
        eq(t.tasks.assignedTo, assignedTo),
        sql`lower(btrim(${t.tasks.part})) = lower(btrim(${part}))`,
        sql`lower(btrim(${t.tasks.station})) = lower(btrim(${station}))`,
      ),
    );
  return rows.some((r) => {
    const s = taskStatus(r.sessionId, (r.status as SessionStatus | null) ?? null);
    return s === "not_started" || s === "in_progress";
  });
}

/**
 * New Task, by a Supervisor or an admin (the API allows no one else), given to a Quality Technician.
 * Title left empty: "First-off check: <part>". Refused when that technician already has it Not started or In progress.
 */
export async function createTask(user: Viewer & { name: string }, body: unknown): Promise<string> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const part = text(b.part, "Part", 1, 120);
  const station = text(b.station, "Station", 2, 80);
  const title = typeof b.title === "string" && b.title.trim() ? text(b.title, "Title", 1, 120) : `First-off check: ${part}`;
  if (!(PRIORITIES as readonly unknown[]).includes(b.priority)) throw new BadRequest("Priority must be high, medium or low");
  let assignee = { id: user.id, name: user.name };
  if (user.role !== "technician") {
    if (typeof b.assignedTo !== "string" || !b.assignedTo) throw new BadRequest("Pick the Quality Technician");
    const found = (await technicians()).find((p) => p.id === b.assignedTo);
    if (!found) throw new BadRequest("That Quality Technician was not found");
    assignee = found;
  }
  const { db } = await getRepo().conn();
  if (await hasActiveDuplicate(db, assignee.id, part, station)) throw new BadRequest(DUPLICATE_TASK);
  const id = crypto.randomUUID();
  await db.insert(t.tasks).values({
    id, title, part, station, priority: b.priority as Priority, assignedTo: assignee.id, assignedName: assignee.name, createdBy: user.id,
  });
  return id;
}

export type StartResult = { ok: true; sessionId: string } | { ok: false; status: 400 | 403 | 404 | 409; error: string; sessionId?: string };

/**
 * Links a check to a task the first time it is opened. Only the task's Quality Technician (or an admin), only
 * once: a task that already has a check answers 409 with that check, so the browser opens it instead.
 */
export async function startTask(user: Viewer, taskId: string, sessionId: unknown): Promise<StartResult> {
  if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(sessionId)) return { ok: false, status: 400, error: "sessionId is not a session id" };
  const { db } = await getRepo().conn();
  const [task] = await db.select().from(t.tasks).where(eq(t.tasks.id, taskId));
  if (!task) return { ok: false, status: 404, error: "This session was not found." };
  if (!seesAllSessions(user.role) && task.assignedTo !== user.id) return { ok: false, status: 403, error: "This session belongs to another Quality Technician." };
  if (task.sessionId) return task.sessionId === sessionId ? { ok: true, sessionId } : { ok: false, status: 409, error: "This session already has a check.", sessionId: task.sessionId };
  const owner = await getRepo().ownerOf(sessionId);
  if (owner.exists && owner.ownerId !== null && owner.ownerId !== user.id && !seesAllSessions(user.role)) {
    return { ok: false, status: 403, error: "That check belongs to another Quality Technician." };
  }
  const linked = await db.update(t.tasks).set({ sessionId }).where(and(eq(t.tasks.id, taskId), isNull(t.tasks.sessionId))).returning({ id: t.tasks.id });
  if (linked.length) return { ok: true, sessionId };
  const [now] = await db.select({ sessionId: t.tasks.sessionId }).from(t.tasks).where(eq(t.tasks.id, taskId));
  return { ok: false, status: 409, error: "This session already has a check.", sessionId: now?.sessionId ?? undefined };
}
