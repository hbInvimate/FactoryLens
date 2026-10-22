// Tasks: first-off checks to do, on the Quality Technician's /tasks page. A task's status is never stored:
// it follows the check started from it, so the check logic stays the only source of truth.
import { and, desc, eq, isNull } from "drizzle-orm";
import * as t from "@/db/schema";
import { readsAllSessions, seesAllSessions, type Role } from "@/lib/auth/roles";
import type { SessionStatus } from "@/lib/check/types";
import { getRepo } from "./repo";
import { shown } from "./supervisor";
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
  /** "task": assigned with New Session or task:create. "check": started by the person on Start a check. */
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
    .select({ task: t.tasks, status: t.sessions.status })
    .from(t.tasks)
    .leftJoin(t.sessions, eq(t.sessions.id, t.tasks.sessionId))
    .where(readsAllSessions(user.role) ? undefined : eq(t.tasks.assignedTo, user.id))
    .orderBy(desc(t.tasks.createdAt))
    .limit(500);
  return rows.map(({ task: r, status }) => ({
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
  }));
}

/**
 * Checks started on Start a check, not from a task: a Quality Technician's own; an admin's or Supervisor's view
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

/**
 * New Task. A Quality Technician's task is their own; an admin may give it to any Quality Technician.
 * Title left empty: "First-off check: <part>".
 */
export async function createTask(user: Viewer & { name: string }, body: unknown): Promise<string> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const part = text(b.part, "Part", 1, 120);
  const station = text(b.station, "Station", 2, 80);
  const title = typeof b.title === "string" && b.title.trim() ? text(b.title, "Title", 1, 120) : `First-off check: ${part}`;
  if (!(PRIORITIES as readonly unknown[]).includes(b.priority)) throw new BadRequest("Priority must be high, medium or low");
  let assignee = { id: user.id, name: user.name };
  if (seesAllSessions(user.role)) {
    if (typeof b.assignedTo !== "string" || !b.assignedTo) throw new BadRequest("Pick the Quality Technician");
    const found = (await technicians()).find((p) => p.id === b.assignedTo);
    if (!found) throw new BadRequest("That Quality Technician was not found");
    assignee = found;
  }
  const { db } = await getRepo().conn();
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
