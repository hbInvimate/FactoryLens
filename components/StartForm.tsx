"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { reduce } from "@/lib/check/reducer";
import { ENDED_STATUSES, STATUS_LABEL, type SessionStatus } from "@/lib/check/types";
import { getActiveId, readLocal, setActiveId } from "@/lib/client/local";
import { createLocalSession, leaveSessionForGood } from "@/lib/client/useCheckSession";
import { SESSION_DEFAULTS, STEP_COUNT } from "@/lib/sop";
import { sopName } from "@/lib/sop-revisions";
import { LeaveDialog } from "./check/Dialogs";
import { StationSelect } from "./StationSelect";
import { Btn, Chip, Panel } from "./ui";

interface Active {
  id: string;
  label: string;
  status: SessionStatus;
  step: number;
}

const START_TIMEOUT_MS = 8000;

/** "id|status|step|label" for the check in progress on this device, or "" if there is none. */
function activeSnapshot(): string {
  const id = getActiveId();
  const local = id ? readLocal(id) : null;
  if (!id || !local) return "";
  const s = reduce(local.actions, local.meta.createdAt);
  if (ENDED_STATUSES.includes(s.status)) {
    setActiveId(null); // a finished session is never "in progress"
    return "";
  }
  return [id, s.status, Math.min(s.current, STEP_COUNT), `${local.meta.part} · ${local.meta.fixture} · ${local.meta.operator}`].join("|");
}

function parse(snap: string): Active | null {
  if (!snap) return null;
  const [id, status, step, label] = snap.split("|");
  return { id, status: status as SessionStatus, step: Number(step), label };
}

// The page stays mounted (hidden) between visits; subscribing again when it is shown re-reads the snapshot.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const refresh = () => listeners.forEach((l) => l());

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[17px] text-muted">{label}</span>
      <input
        id={id}
        value={value}
        maxLength={120}
        required
        onChange={(e) => onChange(e.target.value)}
        className="tap rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[22px] text-ink"
      />
    </label>
  );
}

/** `operatorName`: the signed-in person. The server stores the session under them whatever is sent. */
/** The same part and cell/fixture already open for this person (GET /api/tasks/match). */
type Match = { kind: "check"; sessionId: string } | { kind: "task"; taskId: string } | null;

export function StartForm({ operatorName, sop }: { operatorName: string; /** The Active SOP revision. id null: lib/sop.ts. */ sop: { id: string | null; label: string } }) {
  const router = useRouter();
  const [part, setPart] = useState(SESSION_DEFAULTS.part);
  const [fixture, setFixture] = useState(SESSION_DEFAULTS.fixture);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = parse(useSyncExternalStore(subscribe, activeSnapshot, () => ""));

  // When the page is hidden (we navigated to the check), forget the in-flight start.
  useLayoutEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      setStarting(false);
      setError(null);
      setLeaving(false);
    },
    [],
  );

  const open = (id: string) => {
    setStarting(true);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStarting(false);
      setError("The new check did not open. Check the connection, then tap Retry.");
    }, START_TIMEOUT_MS);
    router.push(`/check/${id}`);
  };

  const startNew = async () => {
    if (!part.trim() || !fixture.trim()) return;
    // The duplicate block: the same part and cell/fixture already In progress opens that check; a task for it still
    // Not started is started instead of a new check. Offline: start a new one as before.
    const match = await fetch(`/api/tasks/match?${new URLSearchParams({ part: part.trim(), station: fixture.trim() })}`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { match: Match }).match : null))
      .catch((): Match => null);
    if (match?.kind === "check") return open(match.sessionId);
    let id: string;
    try {
      id = createLocalSession({
        part: part.trim(), sop: sopName(sop.label), fixture: fixture.trim(), station: fixture.trim(), operator: operatorName,
        ...(sop.id ? { sopRevisionId: sop.id } : {}),
      });
    } catch {
      setError("This device could not store the new check. Tap Retry.");
      return;
    }
    if (!readLocal(id)) {
      setError("This device could not store the new check. Free some browser storage, then tap Retry.");
      return;
    }
    if (match?.kind === "task") {
      const res = await fetch(`/api/tasks/${encodeURIComponent(match.taskId)}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      }).catch(() => null);
      const body = res ? ((await res.json().catch(() => ({}))) as { sessionId?: string }) : {};
      if (res?.status === 409 && body.sessionId) {
        setActiveId(null);
        return open(body.sessionId);
      }
    }
    refresh();
    open(id);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void startNew();
  };

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      {active && (
        <Panel title="A check is in progress on this device">
          <p className="text-[18px] text-ink-2">
            {active.label}. Step {active.step} of 12.
          </p>
          <div className="flex items-center gap-3">
            <Chip tone={active.status === "running" ? "green" : "amber"}>{STATUS_LABEL[active.status]}</Chip>
            <span className="flex-1" />
            <Link
              href={`/check/${active.id}`}
              className="tap inline-flex items-center rounded-[var(--fl-radius-md)] border border-primary bg-primary px-6 text-[20px] font-semibold text-on-strong shadow-card hover:bg-primary-hover"
            >
              Resume the check
            </Link>
            <Btn onClick={() => setLeaving(true)}>End this check</Btn>
          </div>
        </Panel>
      )}

      <Panel title="Start a first-off check">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <p className="text-[17px] text-ink-2">
            SOP: {sopName(sop.label)}, 12 steps. The app follows the procedure. At steps 7 to 10 it records the values you enter, as a working note: the tablet stays the record.
          </p>
          <Field id="part" label="Part" value={part} onChange={setPart} />
          <StationSelect value={fixture} onChange={setFixture} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[17px] text-muted" id="operator-label">
              Quality Technician
            </span>
            <span
              aria-labelledby="operator-label"
              data-testid="operator-name"
              className="flex min-h-[56px] items-center rounded-[var(--fl-radius-md)] border border-line bg-surface-2 px-4 text-[22px] text-ink"
            >
              {operatorName}
            </span>
            <span className="text-[15px] text-muted">You are signed in as this Quality Technician. Not you? Sign out at the bottom of the left menu.</span>
          </div>
          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-4 rounded-[var(--fl-radius-md)] border-2 border-red bg-red-soft px-4 py-2 text-[18px] text-red-ink">
              <span className="flex-1">{error}</span>
              <Btn variant="danger" onClick={startNew}>
                Retry
              </Btn>
            </div>
          )}
          <div className="flex flex-col items-start gap-2 pt-2">
            <Btn type="submit" variant="success" disabled={starting || !!active} className="px-10">
              {starting ? "Starting…" : "Start the check"}
            </Btn>
            {active && <span className="text-base text-muted">Resume or end the check in progress before starting a new one.</span>}
          </div>
        </form>
      </Panel>

      {leaving && active && (
        <LeaveDialog
          body="The old check is marked as left, not finished, and kept in the history. A new check starts."
          confirm="Leave it and start a new check"
          onStay={() => setLeaving(false)}
          onLeave={async (reason) => {
            setLeaving(false);
            await leaveSessionForGood(active.id, reason);
            refresh();
            startNew();
          }}
        />
      )}
    </div>
  );
}
