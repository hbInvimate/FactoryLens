"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { openDeviation, undoCandidate } from "@/lib/check/reducer";
import { deviationText } from "@/lib/check/text";
import type { ActionBody, CheckState } from "@/lib/check/types";
import { useNow, useSpeech } from "@/lib/client/hooks";
import { useCheckSession } from "@/lib/client/useCheckSession";
import { step as sopStep } from "@/lib/sop";
import { Btn, PageCenter } from "../ui";
import { CompleteView } from "./CompleteView";
import { DeviationView } from "./DeviationView";
import { LeaveDialog, PausedOverlay, UndoToast } from "./Dialogs";
import { MainView } from "./MainView";
import { StepDetail } from "./StepDetail";
import { SyncNotice, TopBar } from "./TopBar";

export type View =
  | { kind: "main" }
  | { kind: "detail"; step: number }
  | { kind: "lodge" };

/** What the glasses would say now. Changing the key speaks the line once. */
function spoken(state: CheckState): [string, string] {
  const dev = openDeviation(state);
  if (dev) return [`dev:${dev.id}:${dev.failed}`, deviationText(dev).correction];
  if (state.current <= 12) return [`step:${state.current}`, sopStep(state.current).spoken];
  return ["done", "Check complete. Sign off on the tablet."];
}

export function CheckApp({ id }: { id: string }) {
  const router = useRouter();
  const { meta, actions, state, load, loadError, sync, dispatch, retry } = useCheckSession(id);
  const voice = useSpeech();
  const now = useNow(1000);
  const [view, setView] = useState<View>({ kind: "main" });
  const [leaving, setLeaving] = useState(false);

  const say = voice.say;
  const lastSpoken = useRef<string | null>(null);
  const [speakKey, speakText] = state ? spoken(state) : ["", ""];
  useEffect(() => {
    if (!speakKey || lastSpoken.current === speakKey) return;
    lastSpoken.current = speakKey;
    say(speakText);
  }, [speakKey, speakText, say]);

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
  const ended = state.status === "part_held";
  const undo = now && !state.paused ? undoCandidate(actions, state, now) : null;

  const lodge = () => setView({ kind: "lodge" });
  let screen: React.ReactNode;
  if (dev) {
    screen = (
      <DeviationView
        state={state}
        dev={dev}
        now={now}
        onTap={(step, point) => act({ type: "tap_point", step, point })}
        onRelease={(step) => act({ type: "release_clamps", step })}
        onFixed={(deviation) => act({ type: "fix_continue", deviation })}
        onTrainer={(deviation) => act({ type: "call_trainer", deviation })}
        onLodge={lodge}
      />
    );
  } else if (state.current > 12) {
    screen = <CompleteView state={state} now={now} sync={sync} onOpenHold={() => setView({ kind: "main" })} />;
  } else if (view.kind === "detail") {
    screen = (
      <StepDetail
        state={state}
        n={view.step}
        now={now}
        voice={voice.enabled}
        onSay={say}
        onPick={(step) => setView({ kind: "detail", step })}
        onClose={() => setView({ kind: "main" })}
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
        onLodge={lodge}
      />
    );
  }

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
