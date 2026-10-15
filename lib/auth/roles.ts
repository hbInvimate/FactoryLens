// Who may use which part of the app. Shared by the server checks, the scripts and the sign-in pages.

export const ROLES = ["technician", "engineer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  technician: "Quality Technician",
  engineer: "Process engineer",
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
  dashboard: "Process engineers",
};

/** Session length: a technician's shift is longer than an engineer's sign-in. */
export const SESSION_HOURS: Record<Role, number> = {
  technician: 12,
  engineer: 8,
  admin: 8,
};

export const MAX_SESSION_HOURS = Math.max(...Object.values(SESSION_HOURS));

/** Failed sign-ins allowed per account and address before the pair is locked. */
export const LOGIN_LIMIT = { attempts: 5, minutes: 15 };

export const GENERIC_SIGN_IN_ERROR = "That email and password did not work here.";

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
