"use client";
// "Make this revision active again" (rollback): a reason, then the older revision is Active for new checks.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds";

const SMALL = "min-h-[44px]! min-w-0! px-3! text-[14px]! shadow-none";

export function RollbackButton({ revisionId, label }: { revisionId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sop/revisions/${encodeURIComponent(revisionId)}/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "rollback", reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Could not make it active (${res.status})`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className={SMALL}>
        Make this revision active again
      </Button>
    );
  }
  return (
    <span className="flex w-full flex-col gap-2">
      <textarea
        aria-label={`Reason to make revision ${label} active again`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={2000}
        placeholder="Reason (required)"
        className="min-h-[72px] rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 py-2 text-[15px]"
      />
      {error && (
        <span role="alert" className="text-[13px] text-red-ink">
          {error}
        </span>
      )}
      <span className="flex gap-2">
        <Button variant="primary" disabled={busy || !reason.trim()} onClick={go} className={SMALL}>
          Make revision {label} active
        </Button>
        <Button onClick={() => setOpen(false)} className={SMALL}>
          Cancel
        </Button>
      </span>
    </span>
  );
}
