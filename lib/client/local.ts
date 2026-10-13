// The browser copy of each session. Every action is written here first, so nothing is lost
// on refresh, on a dropped connection or when a save fails.
import type { Action, SessionMeta } from "@/lib/check/types";

export interface LocalSession {
  meta: SessionMeta;
  actions: Action[];
  /** Action ids not yet confirmed by the server. */
  pending: string[];
  /** The server has the session row. */
  created: boolean;
}

const KEY = (id: string) => `fl.session.${id}`;
const ACTIVE = "fl.active";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLocal(id: string): LocalSession | null {
  try {
    const raw = storage()?.getItem(KEY(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalSession;
    return v && v.meta && Array.isArray(v.actions) ? v : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser refused to store it (full or blocked). */
export function writeLocal(s: LocalSession): boolean {
  try {
    storage()?.setItem(KEY(s.meta.id), JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function getActiveId(): string | null {
  try {
    return storage()?.getItem(ACTIVE) ?? null;
  } catch {
    return null;
  }
}

export function setActiveId(id: string | null) {
  try {
    if (id) storage()?.setItem(ACTIVE, id);
    else storage()?.removeItem(ACTIVE);
  } catch {
    // Resume from the history page still works.
  }
}

export function uid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
