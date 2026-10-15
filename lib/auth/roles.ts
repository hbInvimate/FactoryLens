// Who may use which part of the app. Shared by the server checks, the scripts and the sign-in pages.

export const ROLES = ["technician", "engineer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  technician: "Quality Technician",
  engineer: "Quality Engineer",
  admin: "Admin",
};

/** The check app (/, /check, /sessions and their APIs) and the dashboard (/dashboard). */
export type Area = "check" | "dashboard";

export const AREA_ROLES: Record<Area, Role[]> = {
  check: ["technician", "admin"],
  dashboard: ["engineer", "admin"],
};

export const SIGN_IN_PATH: Record<Area, string> = {
  check: "/signin",
  dashboard: "/dashboard/signin",
};

/** Who each area is for, in the "This page is for ..." message. */
export const AREA_FOR: Record<Area, string> = {
  check: "Quality Technicians",
  dashboard: "Quality Engineers",
};

/** Session length: a Quality Technician's shift is longer than a Quality Engineer's sign-in. */
export const SESSION_HOURS: Record<Role, number> = {
  technician: 12,
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

/**
 * Who may open and save a check in the check app: an admin any; a Quality Technician their own,
 * and sessions from before sign-in, which have no owner (so a check in progress during the upgrade can still be finished).
 */
export function canOpenSession(user: { id: string; role: Role }, ownerId: string | null): boolean {
  return seesAllSessions(user.role) || ownerId === null || ownerId === user.id;
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
  const home = area === "check" ? "/" : "/dashboard";
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return home;
  const inDashboard = next === "/dashboard" || next.startsWith("/dashboard/") || next.startsWith("/dashboard?");
  if (next.startsWith("/dashboard/signin") || next.startsWith("/signin")) return home;
  return (area === "dashboard") === inDashboard ? next : home;
}
