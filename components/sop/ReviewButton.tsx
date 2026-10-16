"use client";
// "Review this way": one click builds the Draft and its suggestions, then opens the review.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds";

export function ReviewButton({ candidate, station, range, shift, primary }: { candidate: string; station: string; range: string; shift: string; primary: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sop/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate, station, range, shift }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; revisionId?: string };
      // 409: a draft is already being reviewed; open that one.
      if (body.revisionId) {
        router.push(`/dashboard/sop/review/${encodeURIComponent(body.revisionId)}`);
        return;
      }
      throw new Error(body.error || `Could not build the draft (${res.status})`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant={primary ? "primary" : "secondary"} onClick={go} disabled={busy} className="min-h-[56px] w-[104px] min-w-0! whitespace-normal! px-3! text-[15px] leading-tight">
        {busy ? "Building…" : "Review this way"}
      </Button>
      {error && (
        <span role="alert" className="max-w-[220px] text-right text-[13px] text-red-ink">
          {error}
        </span>
      )}
    </span>
  );
}
