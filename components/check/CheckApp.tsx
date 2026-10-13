"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { activeStop, openDeviation, openHolds, undoCandidate } from "@/lib/check/reducer";
import { deviationText } from "@/lib/check/text";
import type { ActionBody, CheckState } from "@/lib/check/types";
import { useNow, useSpeech } from "@/lib/client/hooks";
import { uid } from "@/lib/client/local";
import { useCheckSession } from "@/lib/client/useCheckSession";
import type { Issue } from "@/lib/issues";
import { step as sopStep } from "@/lib/sop";
import { Btn, PageCenter, Warn } from "../ui";
import { CompleteView } from "./CompleteView";
import { DeviationView } from "./DeviationView";
import { LeaveDialog, PausedOverlay, UndoToast } from "./Dialogs";
import { LodgedView } from "./LodgedView";
import { LodgeFlow } from "./LodgeFlow";
import { MainView } from "./MainView";
import { StepDetail } from "./StepDetail";
import { PartHeldView, StoppedView } from "./StopViews";
import { SyncNotice, TopBar } from "./TopBar";

export type View =
  | { kind: "main" }
  | { kind: "detail"; step: number }
  | { kind: "lodge" }
  | { kind: "lodged"; did: string }
  | { kind: "procedure"; did: string; screen: number };

/** What the glasses would say now. Changing the key speaks the line once. */
function spoken(state: CheckState, view: View): [string, string] {
  if (view.kind === "lodged") {
    const d = state.discrepancies.find((x) => x.id === view.did);
    if (d) {
      const effect = d.effect === "stop" ? "The check is stopped. Do not force anything." : "The check can continue. The cell is on hold.";
      return [`lodged:${d.id}`, `Discrepancy lodged. ${d.issue}. ${effect}`];
    }
  }
  const stop = activeStop(state);
  if (stop) return [`stop:${stop.id}`, "The check is stopped. Keep the part clamped. Do not measure anything else."];
  if (state.status === "part_held") return ["held", "Part held, not checked."];
  const dev = openDeviation(state);
  if (dev) return [`dev:${dev.id}:${dev.failed}`, deviationText(dev).correction];
  if (state.current <= 12) return [`step:${state.current}`, sopStep(state.current).spoken];
  return ["done", "Check complete. Sign off on the tablet."];
}

function HoldStrip({ state, onOpen }: { state: CheckState; onOpen: (did: string) => void }) {
  const holds = openHolds(state);
  if (!holds.length) return null;
  return (
    <div role="status" data-testid="hold-strip" className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 bg-red-bg px-8 py-1.5">
      <Warn size={22} />
      <span className="text-[18px] text-red-soft">
        Cell on hold: {holds.map((h) => h.issue).join("; ")}. The check continues.
      </span>
      <span className="flex-1" />
      {holds.map((h) => (
        <button key={h.id} type="button" onClick={() => onOpen(h.id)} className="tap rounded-xl border-2 border-red px-4 text-[17px] font-semibold text-red-soft">
          {h.proc ? "Hole check procedure" : "Open the hold"}
        </button>
      ))}
    </div>
  );
}

export function CheckApp({ id }: { id: string }) {
  const router = useRouter();
  const { meta, actions, state, load, loadError, sync, dispatch, retry } = useCheckSession(id);
  const voice = useSpeech();
  const now = useNow(1000);
  const [view, setView] = useState<View>({ kind: "main" });
  const [leaving, setLeaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const say = voice.say;
  const lastSpoken = useRef<string | null>(null);
  const [speakKey, speakText] = state ? spoken(state, view) : ["", ""];
  useEffect(() => {
    if (!speakKey || lastSpoken.current === speakKey) return;
    lastSpoken.current = speakKey;
    say(speakText);
  }, [speakKey, speakText, say]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  if (load === "loading" || (load === "ready" && (!state || !meta))) {
    return <PageCenter title="Loading the check…" />;
  }
  if (load === "missing") {
    return (
      <PageCenter title="This check was not found" body="It is not on this device or on the server.">
        <Link href="/" className="tap inline-flex items-center rounded-xl border-2 border-blue bg-blue px-6 text-[20px] font-semibold text-blue-ink">
          Start a check
        </Link>
      </PageCenter>
    );
  }
  if (load === "error" || !state || !meta) {
    return (
      <PageCenter title="Could not load the check" body={loadError ?? "Check the connection."}>
        <Btn variant="primary" onClick={() => window.location.reload()}>
          Retry
        </Btn>
      </PageCenter>
    );
  }

  const act = (body: ActionBody) => dispatch(body);
  const dev = openDeviation(state);
  const stop = activeStop(state);
  const ended = state.status === "part_held";
  const undo = now && !state.paused ? undoCandidate(actions, state, now) : null;
  const main = () => setView({ kind: "main" });
  const openHold = (did: string) => {
    const d = state.discrepancies.find((x) => x.id === did);
    setView(d?.proc ? { kind: "procedure", did, screen: 0 } : { kind: "lodged", did });
  };

  const lodgeIssue = (step: number, issue: Issue, tried: string[]) => {
    const did = uid();
    act({ type: "lodge", did, step, issue: issue.label, tried });
    setView({ kind: "lodged", did });
  };
  const fixedIssue = (step: number, issue: Issue, done: string[]) => {
    act({ type: "fixed_on_spot", did: uid(), step, issue: issue.label, done });
    setFlash(`Logged: "${issue.label}", fixed on the spot. Carry on from where you were.`);
    main();
  };

  const lodged = view.kind === "lodged" ? state.discrepancies.find((d) => d.id === view.did) : undefined;
  const procDisc = view.kind === "procedure" ? state.discrepancies.find((d) => d.id === view.did && d.proc) : undefined;

  let screen: React.ReactNode;
  if (view.kind === "lodge" && !ended) {
    screen = <LodgeFlow current={state.current} onCancel={main} onFixed={fixedIssue} onLodge={lodgeIssue} />;
  } else if (lodged) {
    screen = (
      <LodgedView
        state={state}
        meta={meta}
        d={lodged}
        onBack={main}
        onProcedure={() => setView({ kind: "procedure", did: lodged.id, screen: 0 })}
        onCalled={(who) => act({ type: "call_marked", did: lodged.id, who })}
        onTodo={(index) => act({ type: "todo_tick", did: lodged.id, index })}
        onClear={(who, outcome, reason) => {
          act({ type: "clear", did: lodged.id, who, outcome, reason });
          main();
        }}
      />
    );
  } else if (ended) {
    screen = <PartHeldView state={state} meta={meta} sync={sync} />;
  } else if (stop) {
    screen = (
      <StoppedView
        state={state}
        d={stop}
        now={now}
        onItem={(item) => act({ type: "handoff", did: stop.id, item })}
        onCalled={(who) => act({ type: "call_marked", did: stop.id, who })}
        onClear={(who, outcome, reason) => act({ type: "clear", did: stop.id, who, outcome, reason })}
        onLodge={() => setView({ kind: "lodge" })}
      />
    );
  } else if (procDisc) {
    screen = <PageCenter title="Hole check procedure" body="Coming in the next step." />;
  } else if (dev) {
    screen = (
      <DeviationView
        state={state}
        dev={dev}
        now={now}
        onTap={(step, point) => act({ type: "tap_point", step, point })}
        onRelease={(step) => act({ type: "release_clamps", step })}
        onFixed={(deviation) => act({ type: "fix_continue", deviation })}
        onTrainer={(deviation) => act({ type: "call_trainer", deviation })}
        onLodge={() => setView({ kind: "lodge" })}
      />
    );
  } else if (state.current > 12) {
    screen = <CompleteView state={state} now={now} sync={sync} onOpenHold={openHold} onLodge={() => setView({ kind: "lodge" })} />;
  } else if (view.kind === "detail") {
    screen = (
      <StepDetail
        state={state}
        n={view.step}
        now={now}
        voice={voice.enabled}
        onSay={say}
        onPick={(step) => setView({ kind: "detail", step })}
        onClose={main}
      />
    );
  } else {
    screen = (
      <MainView
        state={state}
        now={now}
        onTap={(step, point) => act({ type: "tap_point", step, point })}
        onNext={(step) => act({ type: "next_step", step })}
        onOpenStep={(step) => setView({ kind: "detail", step })}
        onLodge={() => setView({ kind: "lodge" })}
      />
    );
  }

  const showHoldStrip = !stop && !ended && (view.kind === "main" || view.kind === "detail") && !dev && state.current <= 12;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        meta={meta}
        sync={sync}
        voice={voice.enabled}
        onVoice={voice.toggle}
        onPause={() => act({ type: "pause" })}
        onLeave={() => setLeaving(true)}
        canPause={!ended && state.status !== "complete"}
      />
      <SyncNotice sync={sync} onRetry={retry} />
      {showHoldStrip && <HoldStrip state={state} onOpen={openHold} />}
      {flash && (
        <div role="status" className="flex flex-none items-center gap-3 bg-green-bg px-8 py-2 text-[18px] text-green">
          {flash}
        </div>
      )}
      <main className="flex min-h-0 flex-1 flex-col">{screen}</main>
      {undo && <UndoToast action={undo} now={now} onUndo={() => act({ type: "undo", target: undo.id })} />}
      {state.paused && !leaving && (
        <PausedOverlay reason={state.leaves.at(-1)?.reason} onResume={() => act({ type: "resume" })} />
      )}
      {leaving && (
        <LeaveDialog
          onStay={() => setLeaving(false)}
          onLeave={(reason) => {
            act({ type: "leave", reason });
            setLeaving(false);
            router.push("/");
          }}
        />
      )}
    </div>
  );
}
