"use client";
// "Make this the primary way": a small confirm box with what will change and a required reason.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, StateBanner } from "@/components/ds";
import { Modal } from "@/components/check/Dialogs";
import { mmss } from "@/lib/sop-stats";

export interface ChangeView {
  step: number;
  stepName: string;
  oldCt: number | null;
  newCt: number | null;
  fields: string[];
  newTodo: string | null;
}

export function MakePrimary({ revisionId, label, activeLabel, changes }: { revisionId: string; label: string; activeLabel: string; changes: ChangeView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sop/revisions/${encodeURIComponent(revisionId)}/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "primary", reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Could not make it primary (${res.status})`);
      setOpen(false);
      router.push("/dashboard/sop");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} className="w-full">
        Make this the primary way
      </Button>
      {open && (
        <Modal title={`Make revision ${label} the primary way`} onClose={() => setOpen(false)} wide>
          <p className="text-[17px] text-ink-2">
            New checks use revision {label} from now on, instead of revision {activeLabel}. Checks that are running finish on the revision they started with.
          </p>
          {changes.length === 0 ? (
            <p className="text-[16px] text-amber-ink" data-testid="no-changes">No accepted changes yet: revision {label} is the same as revision {activeLabel}.</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="primary-changes">
              {changes.map((c) => (
                <li key={c.step} data-step={c.step} className="rounded-[var(--fl-radius-md)] border border-line bg-surface-2 px-4 py-2.5 text-[16px]">
                  <b>
                    Step {c.step}: {c.stepName}
                  </b>
                  {c.oldCt !== c.newCt && (
                    <span className="block">
                      CT {mmss(c.oldCt)} → <b>{mmss(c.newCt)}</b>
                    </span>
                  )}
                  {c.newTodo && <span className="block text-[15px] text-ink-2">What to do: {c.newTodo}</span>}
                  {c.fields.filter((f) => f !== "What to do").length > 0 && <span className="block text-[15px] text-ink-2">Also changed: {c.fields.filter((f) => f !== "What to do").join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[16px] text-ink-2">Reason (required)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className="min-h-[96px] rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 py-3 text-[16px]" />
          </label>
          {error && (
            <StateBanner tone="red" role="alert" testId="primary-error">
              {error}
            </StateBanner>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy || !reason.trim()} onClick={confirm}>
              {busy ? "Saving…" : "Confirm and make primary"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
