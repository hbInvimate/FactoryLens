"use client";
// Holds one check session in the browser: rebuilds state from the log, writes every action
// locally first, and sends queued actions to the server with automatic retry.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IDLE_GAP_MS, reduce, sortActions } from "@/lib/check/reducer";
import { ENDED_STATUSES, type Action, type ActionBody, type CheckState, type SessionMeta } from "@/lib/check/types";
import { getActiveId, readLocal, setActiveId, uid, writeLocal, type LocalSession } from "./local";

export type LoadState = "loading" | "ready" | "missing" | "error";

export interface SyncState {
  /** No connection to the server right now. */
  offline: boolean;
  /** Actions waiting to be saved. */
  pending: number;
  saving: boolean;
  /** The server answered with an error. Work is kept; Retry or wait. */
  error: string | null;
  /** The browser refused to store the local copy. */
  localFull: boolean;
  lastSavedAt: number | null;
  /**
   * Saving needs a sign-in: `signin` when the sign-in has ended (401), `not_owner` when the person
   * signed in is not the one who started the check. Nothing is lost: the work stays queued on this device.
   */
  auth: null | "signin" | "not_owner";
}

const BATCH = 400;
const BACKOFF = [1000, 2000, 4000, 8000, 15000];

function merge(local: LocalSession, server: { meta: SessionMeta; actions: Action[] }): LocalSession {
  const have = new Set(local.actions.map((a) => a.id));
  const extra = server.actions.filter((a) => !have.has(a.id));
  return { ...local, actions: [...local.actions, ...extra], created: true };
}

export function useCheckSession(id: string) {
  const [rec, setRec] = useState<LocalSession | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({
    offline: false, pending: 0, saving: false, error: null, localFull: false, lastSavedAt: null, auth: null,
  });

  const recRef = useRef<LocalSession | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});
  /** Set while a sign-in is needed: no sends until `resumeAfterSignIn`. */
  const authBlocked = useRef(false);

  const commit = useCallback((next: LocalSession) => {
    recRef.current = next;
    setRec(next);
    const ok = writeLocal(next);
    setSync((s) => ({ ...s, pending: next.pending.length, localFull: !ok }));
  }, []);

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), ms);
  }, []);

  const flush = useCallback(async () => {
    const cur = recRef.current;
    if (!cur || inFlight.current || authBlocked.current) return;
    if (cur.created && cur.pending.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSync((s) => ({ ...s, offline: true }));
      return; // the "online" event restarts it
    }
    const pendingSet = new Set(cur.pending.slice(0, BATCH));
    const batch = cur.actions.filter((a) => pendingSet.has(a.id));
    inFlight.current = true;
    setSync((s) => ({ ...s, saving: true }));
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(cur.meta.id)}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meta: cur.meta, actions: batch }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (res.status === 401 || (res.status === 403 && body.code === "not_owner")) {
          // Keep everything queued here and ask for a sign-in. No retries until then.
          authBlocked.current = true;
          inFlight.current = false;
          setSync((s) => ({ ...s, saving: false, offline: false, error: null, auth: res.status === 401 ? "signin" : "not_owner" }));
          return;
        }
        throw Object.assign(new Error(body.error || `Save failed (${res.status})`), { http: res.status });
      }
      attempt.current = 0;
      const latest = recRef.current!;
      const sent = new Set(batch.map((a) => a.id));
      commit({ ...latest, created: true, pending: latest.pending.filter((p) => !sent.has(p)) });
      setSync((s) => ({ ...s, offline: false, error: null, saving: false, lastSavedAt: Date.now() }));
      inFlight.current = false;
      if (recRef.current!.pending.length) void flushRef.current();
    } catch (e) {
      inFlight.current = false;
      const http = (e as { http?: number }).http;
      const wait = BACKOFF[Math.min(attempt.current, BACKOFF.length - 1)];
      attempt.current += 1;
      if (http) {
        setSync((s) => ({ ...s, saving: false, offline: false, error: (e as Error).message }));
        schedule(Math.max(wait, 15000));
      } else {
        setSync((s) => ({ ...s, saving: false, offline: true }));
        schedule(wait);
      }
    }
  }, [commit, schedule]);

  useEffect(() => {
    flushRef.current = () => void flush();
  }, [flush]);

  // Load: the local copy first (works offline), then merge in whatever the server has.
  useEffect(() => {
    let cancelled = false;
    const local = readLocal(id);
    if (local) {
      recRef.current = local;
      setRec(local);
      setLoad("ready");
      setSync((s) => ({ ...s, pending: local.pending.length }));
      if (!local.created) {
        // Started on this device and never saved: nothing to fetch yet.
        flushRef.current();
        return;
      }
    }
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          if (!local) setLoad("missing");
          else flushRef.current();
          return;
        }
        if (res.status === 401 && recRef.current) {
          // Signed out, but the check is on this device: keep working and ask for a sign-in.
          authBlocked.current = true;
          setSync((s) => ({ ...s, auth: "signin" }));
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw Object.assign(new Error(body.error || `Error ${res.status}`), { http: res.status });
        }
        const server = (await res.json()) as { meta: SessionMeta; actions: Action[] };
        if (cancelled) return;
        const base = recRef.current ?? { meta: server.meta, actions: [], pending: [], created: true };
        commit(merge(base, server));
        setLoad("ready");
        flushRef.current();
      } catch (e) {
        if (cancelled) return;
        if (recRef.current) {
          const http = (e as { http?: number }).http;
          setSync((s) => (http ? { ...s, error: (e as Error).message } : { ...s, offline: true }));
          schedule(http ? 15000 : BACKOFF[0]);
        } else {
          setLoadError((e as Error).message);
          setLoad("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, commit, schedule]);

  useEffect(() => {
    const on = () => {
      setSync((s) => ({ ...s, offline: false }));
      attempt.current = 0;
      flushRef.current();
    };
    const off = () => setSync((s) => ({ ...s, offline: true }));
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const dispatch = useCallback(
    /** at: only for the idle pause, dated when the 10 minutes ran out. */
    (body: ActionBody, at: number = Date.now()) => {
      const cur = recRef.current;
      if (!cur) return;
      const seq = cur.actions.reduce((m, a) => Math.max(m, a.seq), 0) + 1;
      const action = { ...body, id: uid(), seq, at } as Action;
      commit({ ...cur, actions: [...cur.actions, action], pending: [...cur.pending, action.id] });
      setActiveId(cur.meta.id);
      void flushRef.current();
    },
    [commit],
  );

  // Closing or reloading the page, or hiding the tab, pauses a running check, so that time is not counted in the
  // check time. The pause is kept on this device at once and sent with keepalive; reopening the check (or showing
  // the tab again) resumes it. A pause she chose herself stays until she taps Resume.
  useEffect(() => {
    const onHide = () => {
      const cur = recRef.current;
      if (!cur || reduce(cur.actions, cur.meta.createdAt).status !== "running") return;
      const seq = cur.actions.reduce((m, a) => Math.max(m, a.seq), 0) + 1;
      const pause = { type: "pause", auto: true, id: uid(), seq, at: Date.now() } as Action;
      const next = { ...cur, actions: [...cur.actions, pause], pending: [...cur.pending, pause.id] };
      recRef.current = next;
      writeLocal(next);
      if (authBlocked.current) return;
      const ids = new Set(next.pending.slice(0, BATCH));
      const body = JSON.stringify({ meta: next.meta, actions: next.actions.filter((a) => ids.has(a.id)) });
      // keepalive allows at most 64 KB; anything bigger is sent from this device next time.
      if (body.length < 60_000) {
        void fetch(`/api/sessions/${encodeURIComponent(next.meta.id)}/actions`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body }).catch(() => {});
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") return onHide();
      const cur = recRef.current;
      const last = cur && sortActions(cur.actions).filter((a) => a.type !== "undo").at(-1);
      if (last?.type === "pause" && last.auto) dispatchRef.current({ type: "resume" });
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Reopened after the page was closed: resume on its own, once.
  const autoResumed = useRef(false);
  useEffect(() => {
    if (load !== "ready" || autoResumed.current || !rec) return;
    autoResumed.current = true;
    const last = sortActions(rec.actions).filter((a) => a.type !== "undo").at(-1);
    if (last?.type === "pause" && last.auto) dispatch({ type: "resume" });
  }, [load, rec, dispatch]);

  // Idle: a running check with no activity for IDLE_PAUSE_MINUTES (lib/config.ts) is paused, dated at her last action:
  // the timer stops there, and the idle gap is not counted anyway. Checked on opening the check too.
  useEffect(() => {
    if (load !== "ready") return;
    const check = () => {
      const cur = recRef.current;
      if (!cur) return;
      const s = reduce(cur.actions, cur.meta.createdAt);
      const last = s.activity.at(-1) ?? s.startedAt;
      if (s.status === "running" && Date.now() - last >= IDLE_GAP_MS) dispatch({ type: "pause", idle: true }, Math.max(last, s.lastAt));
    };
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, [load, dispatch]);

  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  /** After signing in again from the check: send everything that waited. */
  const resumeAfterSignIn = useCallback(() => {
    authBlocked.current = false;
    attempt.current = 0;
    setSync((s) => ({ ...s, auth: null, error: null }));
    flushRef.current();
  }, []);

  const retry = useCallback(() => {
    attempt.current = 0;
    setSync((s) => ({ ...s, error: null }));
    flushRef.current();
  }, []);

  const state: CheckState | null = useMemo(
    () => (rec ? reduce(rec.actions, rec.meta.createdAt) : null),
    [rec],
  );

  // A session that is over is never "in progress" on this device.
  const ended = !!state && ENDED_STATUSES.includes(state.status);
  const actionCount = rec?.actions.length ?? 0;
  useEffect(() => {
    if (ended && getActiveId() === id) setActiveId(null);
  }, [ended, id, actionCount]);

  return { meta: rec?.meta ?? null, actions: rec?.actions ?? [], state, load, loadError, sync, dispatch, retry, resumeAfterSignIn };
}

/**
 * Leaves a session for good (with her reason) so a new one can start. The action is kept
 * locally first, then sent; if the send fails it stays queued with that session.
 */
export async function leaveSessionForGood(id: string, reason: string): Promise<void> {
  const cur = readLocal(id);
  if (getActiveId() === id) setActiveId(null);
  if (!cur) return;
  const seq = cur.actions.reduce((m, a) => Math.max(m, a.seq), 0) + 1;
  const action = { type: "leave", reason, end: true, id: uid(), seq, at: Date.now() } as Action;
  const next: LocalSession = { ...cur, actions: [...cur.actions, action], pending: [...cur.pending, action.id] };
  writeLocal(next);
  try {
    const pendingSet = new Set(next.pending);
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meta: next.meta, actions: next.actions.filter((a) => pendingSet.has(a.id)).slice(0, BATCH) }),
    });
    if (res.ok) writeLocal({ ...next, created: true, pending: next.pending.slice(BATCH) });
  } catch {
    // Offline: it stays queued in the local copy of that session.
  }
}

/** Creates a session in the browser. It is saved to the server by the check page. */
export function createLocalSession(meta: Omit<SessionMeta, "id" | "createdAt">): string {
  const id = uid();
  const rec: LocalSession = { meta: { ...meta, id, createdAt: Date.now() }, actions: [], pending: [], created: false };
  writeLocal(rec);
  setActiveId(id);
  return id;
}
