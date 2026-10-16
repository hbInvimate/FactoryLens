"use client";
// "SOP rev B is active. Step 7 changed: ..." with "I have read this". Shown once per person and revision.
import { useState } from "react";
import { Btn } from "./ui";

export function SopBanner({ revisionId, label, summary }: { revisionId: string; label: string; summary: string }) {
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (gone) return null;
  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sop/acknowledgements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revisionId }) });
      if (!res.ok) throw new Error(`Could not save (${res.status}). Try again.`);
      setGone(true);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div role="status" data-testid="sop-banner" className="mx-auto flex w-full max-w-[880px] flex-wrap items-center gap-4 rounded-card border-2 border-blue bg-blue-soft px-5 py-4 text-blue-ink">
      <p className="min-w-0 flex-1 text-[19px]">
        <b>SOP rev {label} is active.</b> {summary}
        {error && <span className="block text-[16px] text-red-ink">{error}</span>}
      </p>
      <Btn variant="primary" onClick={read} disabled={busy}>
        I have read this
      </Btn>
    </div>
  );
}
