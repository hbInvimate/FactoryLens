// Turns a session log into the rows stored in the summary tables.
import { activeCheckMs, conformance, correctFirstTime, checkPointsDone, durationMs, reduce, stepsDone } from "./reducer";
import type { Action, CheckState, SessionMeta, SessionStatus, StepEventKind } from "./types";

export interface SessionRow {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  status: SessionStatus;
  part: string;
  sop: string;
  fixture: string;
  station: string | null;
  operatorLabel: string;
  /** users.id of who started it, when read from the database. Null for older sessions. */
  userId?: string | null;
  /** The SOP revision it ran on, when read from the database. Null: revision A. */
  sopRevisionId?: string | null;
  conformance: number | null;
  correctFirstTime: number;
  currentStep: number;
  stepsDone: number;
  checkPoints: number;
  deviations: number;
  discrepancies: number;
  activeSeconds: number | null;
  /** Active time for lists (see durationMs). */
  durationSeconds: number | null;
  updatedAt: Date;
  /** Set on rows read back from the database: a fake session from db:seed-sample. */
  isSample?: boolean | null;
}

/** The station a session belongs to: the one picked, else its "Cell and fixture" text. */
export function stationOf(meta: Pick<SessionMeta, "station" | "fixture">): string {
  return (meta.station ?? meta.fixture).trim();
}

export interface StepEventRow {
  id: string;
  sessionId: string;
  step: number;
  kind: StepEventKind;
  attempt: number;
  detail: string;
  /** Missed point IDs of a skipped step, or [tapped, expected] for a wrong order. Null: not recorded. */
  points: string[] | null;
  at: Date;
}

export interface PointRow {
  id: string;
  sessionId: string;
  step: number;
  pointId: string;
  confirmedAt: Date;
  sequence: number;
}

export interface DiscrepancyRow {
  id: string;
  sessionId: string;
  step: number;
  issueLabel: string;
  kind: string;
  whoToCall: string[];
  effect: string;
  status: string;
  loggedAt: Date;
  whatWasDone: string;
  clearedBy: string | null;
  clearReason: string | null;
  closedAt: Date | null;
  category: string | null;
  decisionOutcome: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
}

export interface HandoffRow {
  id: string;
  sessionId: string;
  discrepancyId: string;
  marks: boolean;
  photos: number;
  sheet: boolean;
  handedOverAt: Date | null;
  waitingSeconds: number;
  outcome: string | null;
  clearedBy: string | null;
  reason: string | null;
}

/** A spoken or typed value: one row per measure action, corrections included. Never judged. */
export interface MeasurementRow {
  id: string;
  sessionId: string;
  step: number;
  pointId: string;
  value: number | null;
  unit: string;
  source: string;
  textHeard: string;
  confidence: number | null;
  status: string;
  recordedAt: Date;
}

export interface Projection {
  session: SessionRow;
  stepEvents: StepEventRow[];
  points: PointRow[];
  discrepancies: DiscrepancyRow[];
  handoffs: HandoffRow[];
  measurements: MeasurementRow[];
}

/** Every measure action becomes a row; a correction is a new row and the old one stays. */
export function measurementRows(sessionId: string, actions: Action[]): MeasurementRow[] {
  return actions.flatMap((a) =>
    a.type === "measure"
      ? [{
          id: a.id, sessionId, step: a.step, pointId: a.point, value: a.value, unit: a.unit, source: a.source,
          textHeard: a.heard.slice(0, 200), confidence: a.confidence, status: a.status, recordedAt: new Date(a.at),
        }]
      : [],
  );
}

export function endedAt(s: CheckState): number | null {
  if (s.endedAt !== null) return s.endedAt;
  if (s.status !== "complete") return null;
  const times = [s.steps[11].doneAt ?? 0, ...s.discrepancies.map((d) => d.closedAt ?? 0)];
  return Math.max(...times);
}

/** Check time in seconds, only for a complete check (never for one on hold, held, scrapped or left). */
export function activeSecondsOf(s: CheckState): number | null {
  if (s.status !== "complete") return null;
  const ms = activeCheckMs(s);
  return ms === null ? null : Math.round(ms / 1000);
}

export function project(meta: SessionMeta, actions: Action[], now: number): Projection {
  const s = reduce(actions, meta.createdAt);
  const sid = meta.id;
  const lodged = s.discrepancies.filter((d) => d.status !== "fixed_on_spot");
  const ended = endedAt(s);

  return {
    measurements: measurementRows(sid, actions),
    session: {
      id: sid,
      startedAt: new Date(meta.createdAt),
      endedAt: ended === null ? null : new Date(ended),
      status: s.status,
      part: meta.part,
      sop: meta.sop,
      fixture: meta.fixture,
      station: stationOf(meta),
      operatorLabel: meta.operator,
      conformance: conformance(s),
      correctFirstTime: correctFirstTime(s),
      currentStep: s.current,
      stepsDone: stepsDone(s),
      checkPoints: checkPointsDone(s),
      deviations: s.deviations.length,
      discrepancies: s.discrepancies.length,
      activeSeconds: activeSecondsOf(s),
      durationSeconds: (() => {
        const ms = durationMs(s);
        return ms === null ? null : Math.round(ms / 1000);
      })(),
      updatedAt: new Date(now),
    },
    stepEvents: s.stepEvents.map((e) => ({
      id: e.id, sessionId: sid, step: e.step, kind: e.kind, attempt: e.attempt, detail: e.detail,
      points: e.points.length ? e.points : null, at: new Date(e.at),
    })),
    points: s.steps.flatMap((r) =>
      r.confirmed.map((c) => ({
        id: c.id, sessionId: sid, step: r.n, pointId: c.point, confirmedAt: new Date(c.at), sequence: c.order,
      })),
    ),
    discrepancies: s.discrepancies.map((d) => {
      const done = [
        ...d.done.map((x) => `Fix step done: ${x}`),
        ...(d.status === "fixed_on_spot" ? ["Fixed on the spot"] : []),
        ...d.called.map((w) => `Called: ${w}`),
        ...(d.proc?.holes.length ? [`Holes reported out: ${d.proc.holes.join(", ")}`] : []),
        ...(d.proc?.trials ?? []).map((t, i) => `Trial ${i + 1}: ${t.outcome.replace("_", " ")}`),
      ];
      return {
        id: d.id, sessionId: sid, step: d.step, issueLabel: d.issue, kind: d.kind, whoToCall: d.who,
        effect: d.effect, status: d.status, loggedAt: new Date(d.loggedAt), whatWasDone: done.join("\n"),
        clearedBy: d.clearedBy, clearReason: d.clearReason, closedAt: d.closedAt === null ? null : new Date(d.closedAt),
        category: d.category,
        decisionOutcome: d.decision?.outcome ?? null,
        decidedBy: d.decision?.by ?? null,
        decisionReason: d.decision?.reason ?? null,
        decidedAt: d.decision ? new Date(d.decision.decidedAt) : null,
      };
    }),
    handoffs: lodged.map((d) => {
      const from = d.handoff.handedOverAt;
      const to = d.closedAt ?? now;
      return {
        id: `${d.id}:handoff`, sessionId: sid, discrepancyId: d.id,
        marks: d.handoff.marks, photos: d.handoff.photos, sheet: d.handoff.sheet,
        handedOverAt: from === null ? null : new Date(from),
        waitingSeconds: from === null ? 0 : Math.max(0, Math.round((to - from) / 1000)),
        outcome: d.status === "open" ? null : d.status,
        clearedBy: d.clearedBy, reason: d.clearReason,
      };
    }),
  };
}
