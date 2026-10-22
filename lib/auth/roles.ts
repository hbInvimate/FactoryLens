// Who may use which part of the app. Shared by the server checks, the scripts and the sign-in pages.

export const ROLES = ["technician", "supervisor", "engineer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  technician: "Quality Technician",
  supervisor: "Supervisor",
  engineer: "Quality Engineer",
  admin: "Admin",
};

/**
 * The check app (/, /check, /sessions and their APIs), the dashboard (/dashboard), the Supervisor pages
 * (/supervisor) and one saved session's page (/sessions/[id]): a Supervisor reads it, never changes it.
 */
export type Area = "check" | "dashboard" | "supervisor" | "session";

export const AREA_ROLES: Record<Area, Role[]> = {
  check: ["technician", "admin"],
  dashboard: ["engineer", "admin"],
  supervisor: ["supervisor", "admin"],
  session: ["technician", "supervisor", "admin"],
};

export const SIGN_IN_PATH: Record<Area, string> = {
  check: "/signin",
  dashboard: "/dashboard/signin",
  supervisor: "/supervisor/signin",
  session: "/signin",
};

/** Where each area starts after sign-in. */
export const AREA_HOME: Record<Area, string> = { check: "/tasks", dashboard: "/dashboard", supervisor: "/supervisor", session: "/tasks" };

/** Who each area is for, in the "This page is for ..." message. */
export const AREA_FOR: Record<Area, string> = {
  check: "Quality Technicians",
  dashboard: "Quality Engineers",
  supervisor: "Supervisors",
  session: "Quality Technicians and Supervisors",
};

/** The sign-in page's modes, in this order: the role and the area each signs in to. */
export const SIGN_IN_MODES: { role: Role; area: Area; text: string }[] = [
  { role: "technician", area: "check", text: "Run first-off checks, step by step." },
  { role: "supervisor", area: "supervisor", text: "Watch checks, the team and first-time right." },
  { role: "engineer", area: "dashboard", text: "Review sessions and manage the SOP." },
];

/** Session length: a Quality Technician's or Supervisor's shift is longer than a Quality Engineer's sign-in. */
export const SESSION_HOURS: Record<Role, number> = {
  technician: 12,
  supervisor: 12,
  engineer: 8,
  admin: 8,
};

export const MAX_SESSION_HOURS = Math.max(...Object.values(SESSION_HOURS));

/** Failed sign-ins allowed per account and address before the pair is locked. */
export const LOGIN_LIMIT = { attempts: 5, minutes: 15 };

export const GENERIC_SIGN_IN_ERROR = "That email and password did not work here.";

/** An admin sees every session in the check app's history; a Quality Technician sees only their own. */
export function seesAllSessions(role: Role): boolean {
  return role === "admin";
}

/** Who may read every session, never change one: an admin and a Supervisor. */
export function readsAllSessions(role: Role): boolean {
  return role === "admin" || role === "supervisor";
}

/**
 * Who may open and save a check in the check app: an admin any; a Quality Technician their own,
 * and sessions from before sign-in, which have no owner (so a check in progress during the upgrade can still be finished).
 */
export function canOpenSession(user: { id: string; role: Role }, ownerId: string | null): boolean {
  return seesAllSessions(user.role) || ownerId === null || ownerId === user.id;
}

/** Who may read a saved session's page: whoever may open it, and a Supervisor (read-only). */
export function canViewSession(user: { id: string; role: Role }, ownerId: string | null): boolean {
  return readsAllSessions(user.role) || canOpenSession(user, ownerId);
}

export const NOT_OWNER_ERROR = "This check belongs to another Quality Technician. Sign in as that person to save it.";

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function canUse(role: string, area: Area): boolean {
  return isRole(role) && AREA_ROLES[area].includes(role);
}

/** Only same-site paths inside the area, so ?next= cannot send anyone elsewhere. */
export function safeNext(next: unknown, area: Area): string {
  const home = AREA_HOME[area];
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return home;
  if (next.startsWith("/dashboard/signin") || next.startsWith("/signin") || next.startsWith("/supervisor/signin")) return home;
  const under = (p: string) => next === p || next.startsWith(`${p}/`) || next.startsWith(`${p}?`);
  const nextArea: Area = under("/dashboard") ? "dashboard" : under("/supervisor") ? "supervisor" : "check";
  // A Supervisor may come back to a session's page.
  if (area === "supervisor" && /^\/sessions\/[A-Za-z0-9_-]+$/.test(next)) return next;
  return nextArea === (area === "session" ? "check" : area) ? next : home;
}
