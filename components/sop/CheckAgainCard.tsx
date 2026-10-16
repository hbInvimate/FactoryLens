"use client";
// Optional "Check again": tests the draft's new CTs against the other completed real checks. Never blocks activation.
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, Card, StateBanner } from "@/components/ds";
import type { CheckAgainResult } from "@/lib/server/sopActivate";

export function CheckAgainCard({ revisionId, station, latest, children }: { revisionId: string; station: string | null; latest: (CheckAgainResult & { stale: boolean }) | null; children?: ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sop/revisions/${encodeURIComponent(revisionId)}/check-again`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ station }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Could not check again (${res.status})`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pct = latest && latest.others ? Math.round((latest.meeting / latest.others) * 100) : null;
  return (
    <Card className="flex flex-col gap-3 px-6 py-5" testId="check-again">
      <div>
        <h2 className="text-[20px] font-semibold">Check again</h2>
        <p className="text-[14px] text-muted">Optional. Tests the draft against the other completed real checks in the last 30 days.</p>
      </div>
      {latest ? (
        <div className="flex flex-col gap-1 text-[15px]" data-testid="check-again-result">
          {latest.stale && (
            <p className="w-fit rounded-full border border-amber-line bg-amber-soft px-3 py-0.5 text-[13px] font-semibold text-amber-ink" data-testid="check-again-stale">
              The draft changed since. Run it again for current results.
            </p>
          )}
          <p>
            Would be met in <b>{latest.meeting} of {latest.others}</b> other checks{pct !== null ? ` (${pct}%)` : ""}
          </p>
          <p>
            By <b>{latest.technicians}</b> Quality {latest.technicians === 1 ? "Technician" : "Technicians"} on <b>{latest.shifts}</b> {latest.shifts === 1 ? "shift" : "shifts"}
          </p>
          <p>
            First-time correct in those checks: <b>{latest.firstTimeCorrect === null ? "—" : `${latest.firstTimeCorrect}%`}</b>
          </p>
          {latest.warnings.map((w) => (
            <p key={w} className="w-fit rounded-full border border-amber-line bg-amber-soft px-3 py-0.5 text-[13px] font-semibold text-amber-ink">
              {w}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[15px] text-ink-2">Not run yet.</p>
      )}
      {error && (
        <StateBanner tone="red" role="alert">
          {error}
        </StateBanner>
      )}
      <div className="flex flex-col gap-3">
        <Button onClick={run} disabled={busy || !station}>
          {busy ? "Checking…" : "Check again"}
        </Button>
        {children}
      </div>
    </Card>
  );
}
