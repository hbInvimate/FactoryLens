"use client";
// "Use this way": runs the comparison on one check (the "platform is working" pop-up), then opens the
// verify screen. Over 20 seconds or an error: a clear message with Retry.
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import { Button } from "@/components/ds";
import { Modal } from "@/components/check/Dialogs";

const LIMIT_MS = 20_000;
const SMALL = "min-h-[44px]! min-w-0! px-3! text-[14px]! shadow-none";

function Mark({ done }: { done: boolean }) {
  return <span aria-hidden className="text-primary">{done ? "✔" : "●"}</span>;
}

type State = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string } | { kind: "none" };

export function UseThisWay({ sessionId, label, startedAt, activeLabel }: { sessionId: string; label: string; startedAt: string; activeLabel: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const ctl = useRef<AbortController | null>(null);
  // The progress lines tick on while the comparison runs (it is one request on the server).
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (state.kind !== "working") return;
    const a = setTimeout(() => setPhase(1), 400);
    const b = setTimeout(() => setPhase(2), 1000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [state.kind]);
  // When the page is hidden (we went to the result page), forget the pop-up,
  // so coming back shows the list and "Use this way" starts fresh.
  useLayoutEffect(
    () => () => {
      setState({ kind: "idle" });
      setPhase(0);
    },
    [],
  );

  const run = async () => {
    setPhase(0);
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
          <p className="-mt-2 text-[15px] text-muted">
            Session of <LocalTime iso={startedAt} /> · {label}
          </p>
          {state.kind === "working" && (
            <div role="status" className="flex flex-col gap-3" data-testid="platform-working">
              <ul className="flex flex-col gap-2 text-[17px]">
                <li className={phase >= 1 ? "text-ink" : "font-semibold text-ink"}><Mark done={phase >= 1} /> Read the session</li>
                {phase >= 1 && (
                  <li className={phase >= 2 ? "text-ink" : "font-semibold text-ink"}>
                    <Mark done={phase >= 2} /> Compared it with SOP rev {activeLabel} and the other checks
                  </li>
                )}
                {phase >= 2 && <li className="font-semibold text-ink"><Mark done={false} /> Finding what would change…</li>}
              </ul>
              <p className="rounded-[var(--fl-radius-md)] border border-primary-line bg-primary-soft px-4 py-2.5 text-[15px] text-ink">
                <b>Nothing is changed yet.</b> You will check the result first.
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
