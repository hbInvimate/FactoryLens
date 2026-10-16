"use client";
// "Confirm and update SOP" and "Discard". All or nothing. If saving fails or takes over 20 seconds: a clear
// message with Retry, and the proposal stays on screen. Confirm is safe to retry: the server activates once.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, StateBanner } from "@/components/ds";

const LIMIT_MS = 20_000;

export function VerifyActions({ revisionId }: { revisionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "confirm" | "discard">(null);
  const [error, setError] = useState<{ message: string; retry: "confirm" | "discard" } | null>(null);

  const send = async (what: "confirm" | "discard") => {
    setBusy(what);
    setError(null);
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), LIMIT_MS);
    try {
      const res = await fetch(`/api/sop/update/${encodeURIComponent(revisionId)}/${what}`, { method: "POST", signal: c.signal });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Could not save (${res.status}).`);
      router.refresh();
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      const message = aborted ? "Saving did not finish within 20 seconds." : (e as Error).message === "Failed to fetch" ? "The connection dropped while saving." : (e as Error).message;
      setError({ message: `${message} The SOP was not changed by this attempt. Press Retry.`, retry: what });
      setBusy(null);
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <StateBanner tone="red" role="alert" testId="verify-error">
          {error.message}{" "}
          <Button variant="primary" onClick={() => send(error.retry)} className="ml-2 min-h-[44px]! text-[15px]!">
            Retry
          </Button>
        </StateBanner>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => send("confirm")} disabled={busy !== null}>
          {busy === "confirm" ? "Saving…" : "Confirm and update SOP"}
        </Button>
        <Button onClick={() => send("discard")} disabled={busy !== null}>
          {busy === "discard" ? "Discarding…" : "Discard"}
        </Button>
      </div>
    </div>
  );
}
