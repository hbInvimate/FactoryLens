"use client";
// Opening a task. Not started: a new check with the task's part and station, on the Active SOP revision,
// linked to the task. Started: its check. A check already in progress on this device is finished first.
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ds";
import { reduce } from "@/lib/check/reducer";
import { ENDED_STATUSES } from "@/lib/check/types";
import { getActiveId, readLocal, setActiveId } from "@/lib/client/local";
import { createLocalSession } from "@/lib/client/useCheckSession";
import { sopName } from "@/lib/sop-revisions";

const SMALL = "min-h-[56px] px-4 text-[15px] shadow-none";

/** The check in progress on this device, if any. */
function activeCheck(): string | null {
  const id = getActiveId();
  const local = id ? readLocal(id) : null;
  if (!id || !local) return null;
  return ENDED_STATUSES.includes(reduce(local.actions, local.meta.createdAt).status) ? null : id;
}

export function OpenTask({
  task, operatorName, sop,
}: {
  task: { id: string; title: string; part: string; station: string; sessionId: string | null };
  operatorName: string;
  sop: { id: string | null; label: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; resume?: string } | null>(null);
  // When the page is hidden (we went to the check), forget the in-flight open.
  useLayoutEffect(
    () => () => {
      setBusy(false);
      setError(null);
    },
    [],
  );

  if (task.sessionId) {
    return (
      <ButtonLink href={`/check/${task.sessionId}`} className={SMALL} aria-label={`Open ${task.title}`}>
        Open
      </ButtonLink>
    );
  }

  const start = async () => {
    setError(null);
    const active = activeCheck();
    if (active) {
      setError({ text: "A check is in progress on this device. Finish or leave it first.", resume: active });
      return;
    }
    setBusy(true);
    let id: string;
    try {
      id = createLocalSession({
        part: task.part, sop: sopName(sop.label), fixture: task.station, station: task.station, operator: operatorName,
        ...(sop.id ? { sopRevisionId: sop.id } : {}),
      });
    } catch {
      setBusy(false);
      setError({ text: "This device could not store the new check. Tap Start again." });
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; sessionId?: string };
      if (res.status === 409 && body.sessionId) {
        // Started meanwhile (another tab or device): open that check instead.
        setActiveId(null);
        router.push(`/check/${body.sessionId}`);
        return;
      }
      if (!res.ok) throw new Error(body.error || `The task did not open (${res.status}).`);
      router.push(`/check/${id}`);
    } catch (e) {
      setActiveId(null);
      setBusy(false);
      const msg = (e as Error).message === "Failed to fetch" ? "The connection dropped." : (e as Error).message;
      setError({ text: `${msg} Tap Start again.` });
    }
  };

  return (
    <span className="flex flex-col items-start gap-1.5">
      <Button variant="primary" onClick={start} disabled={busy} className={SMALL} aria-label={`Start ${task.title}`}>
        {busy ? "Starting…" : "Start"}
      </Button>
      {error && (
        <span role="alert" className="max-w-[260px] text-[14px] text-red-ink">
          {error.text}{" "}
          {error.resume && (
            <a href={`/check/${error.resume}`} className="font-semibold underline">
              Resume it
            </a>
          )}
        </span>
      )}
    </span>
  );
}