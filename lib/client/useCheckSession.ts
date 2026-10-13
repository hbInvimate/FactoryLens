"use client";
// Holds one check session in the browser: rebuilds state from the log, writes every action
// locally first, and sends queued actions to the server with automatic retry.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reduce } from "@/lib/check/reducer";
import type { Action, ActionBody, CheckState, SessionMeta } from "@/lib/check/types";
import { readLocal, setActiveId, uid, writeLocal, type LocalSession } from "./local";

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
    offline: false, pending: 0, saving: false, error: null, localFull: false, lastSavedAt: null,
  });

  const recRef = useRef<LocalSession | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});

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
    if (!cur || inFlight.current) return;
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
        const body = (await res.json().catch(() => ({}))) as { error?: string };
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
    (body: ActionBody) => {
      const cur = recRef.current;
      if (!cur) return;
      const seq = cur.actions.reduce((m, a) => Math.max(m, a.seq), 0) + 1;
      const action = { ...body, id: uid(), seq, at: Date.now() } as Action;
      commit({ ...cur, actions: [...cur.actions, action], pending: [...cur.pending, action.id] });
      setActiveId(cur.meta.id);
      void flushRef.current();
    },
    [commit],
  );

  const retry = useCallback(() => {
    attempt.current = 0;
    setSync((s) => ({ ...s, error: null }));
    flushRef.current();
  }, []);

  const state: CheckState | null = useMemo(
    () => (rec ? reduce(rec.actions, rec.meta.createdAt) : null),
    [rec],
  );

  return { meta: rec?.meta ?? null, actions: rec?.actions ?? [], state, load, loadError, sync, dispatch, retry };
}

/** Creates a session in the browser. It is saved to the server by the check page. */
export function createLocalSession(meta: Omit<SessionMeta, "id" | "createdAt">): string {
  const id = uid();
  const rec: LocalSession = { meta: { ...meta, id, createdAt: Date.now() }, actions: [], pending: [], created: false };
  writeLocal(rec);
  setActiveId(id);
  return id;
}
