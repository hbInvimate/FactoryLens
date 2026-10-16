"use client";
// "Discard draft": the draft is kept in SOP history as Discarded and never runs. Asks once before it acts.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds";

const SMALL = "min-h-[44px]! min-w-0! px-3! text-[14px]! shadow-none";

export function DiscardDraftButton({ revisionId, label, after }: { revisionId: string; label: string; /** Where to go once discarded; default: stay and refresh. */ after?: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sop/update/${encodeURIComponent(revisionId)}/discard`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Could not discard (${res.status}). Try again.`);
      if (after) router.push(after);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  if (!asking) {
    return (
      <Button variant="danger" onClick={() => setAsking(true)} className={SMALL}>
        Discard draft
      </Button>
    );
  }
  return (
    <span className="flex flex-col gap-2" data-testid="discard-confirm">
      <span className="text-[14px] text-ink-2">Discard draft {label}? It stays in SOP history as Discarded and never runs. The SOP does not change.</span>
      {error && (
        <span role="alert" className="text-[13px] text-red-ink">
          {error}
        </span>
      )}
      <span className="flex gap-2">
        <Button variant="danger" disabled={busy} onClick={go} className={SMALL}>
          {busy ? "Discarding…" : `Discard draft ${label}`}
        </Button>
        <Button disabled={busy} onClick={() => setAsking(false)} className={SMALL}>
          Cancel
        </Button>
      </span>
    </span>
  );
}
