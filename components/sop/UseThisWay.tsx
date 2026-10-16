"use client";
// "Use this way": runs the comparison on one check (the "platform is working" pop-up), then opens the
// verify screen. Over 20 seconds or an error: a clear message with Retry.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ds";
import { Modal } from "@/components/check/Dialogs";

const LIMIT_MS = 20_000;
const SMALL = "min-h-[44px]! min-w-0! px-3! text-[14px]! shadow-none";

type State = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string } | { kind: "none" };

export function UseThisWay({ sessionId, label }: { sessionId: string; label: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const ctl = useRef<AbortController | null>(null);

  const run = async () => {
    setState({ kind: "working" });
    const c = new AbortController();
    ctl.current = c;
    const timer = setTimeout(() => c.abort(), LIMIT_MS);
    try {
      const res = await fetch("/api/sop/update/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
        signal: c.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; revisionId?: string; noChange?: boolean };
      if (!res.ok) throw new Error(body.error || `The comparison failed (${res.status}).`);
      if (body.noChange) {
        setState({ kind: "none" });
        return;
      }
      router.push(`/dashboard/update-sop/${encodeURIComponent(body.revisionId as string)}`);
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setState({ kind: "error", message: aborted ? "The comparison did not finish within 20 seconds." : (e as Error).message });
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <>
      <Button variant="primary" onClick={run} className={SMALL} disabled={state.kind === "working"}>
        Use this way
      </Button>
      {state.kind !== "idle" && (
        <Modal title={state.kind === "working" ? "The platform is working" : state.kind === "none" ? "No clear difference" : "That did not work"}>
          {state.kind === "working" && (
            <div role="status" className="flex items-center gap-4" data-testid="platform-working">
              <span aria-hidden className="size-8 flex-none animate-spin rounded-full border-4 border-primary-soft border-t-primary" />
              <p className="text-[17px] text-ink-2">
                Comparing the check by {label} with the active SOP and the station&apos;s other checks. This takes a few seconds.
              </p>
            </div>
          )}
          {state.kind === "none" && (
            <>
              <p className="text-[17px] text-ink-2" data-testid="no-difference">
                No clear difference found. Nothing to change.
              </p>
              <div className="flex justify-end">
                <Button onClick={() => setState({ kind: "idle" })}>Back</Button>
              </div>
            </>
          )}
          {state.kind === "error" && (
            <>
              <p role="alert" className="text-[17px] text-red-ink" data-testid="propose-error">
                {state.message} Nothing was changed.
              </p>
              <div className="flex justify-end gap-3">
                <Button onClick={() => setState({ kind: "idle" })}>Back</Button>
                <Button variant="primary" onClick={run}>
                  Retry
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
