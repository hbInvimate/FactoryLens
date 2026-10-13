// Checks what the browser sends before it reaches the database.
import { ACTION_TYPES, type Action, type SessionMeta } from "@/lib/check/types";

export const MAX_ACTIONS_PER_SAVE = 500;
const ID = /^[A-Za-z0-9_-]{6,64}$/;

export class BadRequest extends Error {}

export function isSessionId(id: string): boolean {
  return ID.test(id);
}

function str(v: unknown, field: string, max = 120): string {
  if (typeof v !== "string") throw new BadRequest(`${field} must be text`);
  const t = v.trim();
  if (!t || t.length > max) throw new BadRequest(`${field} must be 1 to ${max} characters`);
  return t;
}

function time(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 1.6e12 || v > Date.now() + 86_400_000) {
    throw new BadRequest(`${field} is not a valid time`);
  }
  return v;
}

export function parseMeta(v: unknown, id: string): SessionMeta {
  if (!v || typeof v !== "object") throw new BadRequest("meta is missing");
  const m = v as Record<string, unknown>;
  if (m.id !== id) throw new BadRequest("meta.id does not match the URL");
  return {
    id,
    part: str(m.part, "part"),
    sop: str(m.sop, "sop"),
    fixture: str(m.fixture, "fixture"),
    operator: str(m.operator, "operator"),
    createdAt: time(m.createdAt, "createdAt"),
  };
}

export function parseActions(v: unknown): Action[] {
  if (!Array.isArray(v)) throw new BadRequest("actions must be a list");
  if (v.length > MAX_ACTIONS_PER_SAVE) throw new BadRequest(`At most ${MAX_ACTIONS_PER_SAVE} actions per save`);
  return v.map((x, i) => {
    if (!x || typeof x !== "object") throw new BadRequest(`actions[${i}] is not an object`);
    const a = x as Record<string, unknown>;
    if (typeof a.id !== "string" || !ID.test(a.id)) throw new BadRequest(`actions[${i}].id is not valid`);
    if (typeof a.seq !== "number" || !Number.isInteger(a.seq) || a.seq < 0) throw new BadRequest(`actions[${i}].seq is not valid`);
    time(a.at, `actions[${i}].at`);
    if (!ACTION_TYPES.includes(a.type as Action["type"])) throw new BadRequest(`actions[${i}].type is not known`);
    if (JSON.stringify(a).length > 4000) throw new BadRequest(`actions[${i}] is too large`);
    const bad = fieldProblem(a);
    if (bad) throw new BadRequest(`actions[${i}] (${String(a.type)}): ${bad}`);
    // The reducer then ignores anything that does not fit the SOP.
    return a as unknown as Action;
  });
}

const isStr = (v: unknown, max = 500) => typeof v === "string" && v.length <= max;
const isInt = (v: unknown) => typeof v === "number" && Number.isInteger(v);
const isStrList = (v: unknown) => Array.isArray(v) && v.length <= 50 && v.every((x) => isStr(x, 200));

const FIELDS: Record<Action["type"], Record<string, (v: unknown) => boolean>> = {
  tap_point: { step: isInt, point: (v) => isStr(v, 8) },
  next_step: { step: isInt },
  release_clamps: { step: isInt },
  fix_continue: { deviation: (v) => isStr(v, 64) },
  call_trainer: { deviation: (v) => isStr(v, 64) },
  undo: { target: (v) => isStr(v, 64) },
  pause: {},
  resume: {},
  leave: { reason: (v) => isStr(v, 500), end: (v) => v === undefined || typeof v === "boolean" },
  fixed_on_spot: { did: (v) => isStr(v, 64), step: isInt, issue: (v) => isStr(v, 200), done: isStrList },
  lodge: { did: (v) => isStr(v, 64), step: isInt, issue: (v) => isStr(v, 200), tried: isStrList },
  call_marked: { did: (v) => isStr(v, 64), who: (v) => isStr(v, 100) },
  todo_tick: { did: (v) => isStr(v, 64), index: isInt },
  handoff: { did: (v) => isStr(v, 64), item: (v) => ["marks", "photo", "sheet", "handed_over"].includes(v as string) },
  clear: {
    did: (v) => isStr(v, 64), who: (v) => isStr(v, 200), reason: (v) => isStr(v, 1000),
    outcome: (v) => v === "cleared" || v === "scrapped",
  },
  proc_tick: { did: (v) => isStr(v, 64), key: (v) => isStr(v, 8) },
  proc_holes: { did: (v) => isStr(v, 64), holes: isStrList },
  proc_parts: { did: (v) => isStr(v, 64), count: (v) => typeof v === "number" && Number.isFinite(v) },
  trial_outcome: { did: (v) => isStr(v, 64), outcome: (v) => ["pass", "better", "no_better"].includes(v as string) },
  proc_close: { did: (v) => isStr(v, 64) },
};

function fieldProblem(a: Record<string, unknown>): string | null {
  const spec = FIELDS[a.type as Action["type"]];
  for (const [k, ok] of Object.entries(spec)) if (!ok(a[k])) return `${k} is not valid`;
  return null;
}
