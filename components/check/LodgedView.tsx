"use client";
// Screens 09 and 10: what was logged, who to call, what to do now, and whether the check stops.
import { useState } from "react";
import { CONTINUE_TODO, STOP_TODO } from "@/lib/issues";
import { reminderOnlyCalls } from "@/lib/integrations";
import { HOLD_OUTCOMES, type CheckState, type Discrepancy, type SessionMeta } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import { stepLabel } from "@/lib/sop";
import { Banner, Btn, Chip, Frame, KV, Panel, Ring, Tick, cx } from "../ui";
import { HoldDecisionDialog, type DecisionInput } from "./StopViews";

export function sessionTime(state: CheckState, at: number): string {
  const paused = state.pauses.reduce((t, p) => t + Math.max(0, Math.min(p.to ?? at, at) - p.from), 0);
  return fmtClock(at - state.startedAt - paused);
}

export function CallList({ d, onCalled }: { d: Discrepancy; onCalled: (who: string) => void }) {
  return (
    <Panel title="Call">
      {d.who.length === 0 && <p className="text-[18px] text-ink-2">No call needed.</p>}
      {d.who.map((w) => {
        const called = d.called.includes(w);
        return (
          <div key={w} className="flex items-center gap-3">
            <span aria-hidden className={cx("size-3 flex-none rounded-full", called ? "bg-primary" : "bg-amber")} />
            <span className="flex-1 text-[20px]">{w}</span>
            <button
              type="button"
              onClick={() => onCalled(w)}
              disabled={called}
              aria-label={called ? `${w} called` : `Mark ${w} as called`}
              className="tap rounded-full px-2"
            >
              <Chip tone={called ? "green" : "amber"}>{called ? "Called" : "To call"}</Chip>
            </button>
          </div>
        );
      })}
      {!reminderOnlyCalls.linked && (
        <span className="text-sm text-muted">A real call needs a link to the plant call or andon system. Until then this is a reminder. Tap when you have called.</span>
      )}
    </Panel>
  );
}

export function TodoList({ d, onTick }: { d: Discrepancy; onTick: (i: number) => void }) {
  const items = d.effect === "stop" ? STOP_TODO : CONTINUE_TODO;
  const next = d.todo.findIndex((t) => !t);
  return (
    <Panel title="What to do now">
      {items.map((x, k) => (
        <button
          key={x}
          type="button"
          aria-pressed={d.todo[k]}
          onClick={() => onTick(k)}
          className={cx("tap flex items-center gap-3.5 rounded-[10px] px-3 py-1 text-left", k === next && "bg-blue-soft")}
        >
          {d.todo[k] ? <Tick size={26} /> : <Ring n={k + 1} size={26} active={k === next} />}
          <span className={cx("text-[19px]", d.todo[k] && "text-muted")}>{x}</span>
        </button>
      ))}
    </Panel>
  );
}

export function LodgedView({
  state, meta, d, onBack, onProcedure, onCalled, onTodo, onDecision,
}: {
  state: CheckState;
  meta: SessionMeta;
  d: Discrepancy;
  onBack: () => void;
  onProcedure: () => void;
  onCalled: (who: string) => void;
  onTodo: (i: number) => void;
  onDecision: (x: DecisionInput) => void;
}) {
  const [clearing, setClearing] = useState(false);
  const stop = d.effect === "stop";
  const open = d.status === "open" || d.status === "escalated";
  const effect = stop
    ? "The check is stopped."
    : open
      ? "The check can continue. The cell is on hold."
      : `Hold closed: ${HOLD_OUTCOMES.find((o) => o.id === d.status)?.label ?? d.status}.`;

  return (
    <>
      <Frame tone="red" />
      <Banner tone="red" title="Discrepancy lodged" sub={d.issue} chip={`Logged ${sessionTime(state, d.loggedAt)}`} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-8 py-6">
        <div className="flex gap-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <Panel title="What was logged">
              <div>
                <KV k="Step" v={stepLabel(d.step)} />
                <KV k="Issue" v={d.issue} />
                <KV k="Reported by" v={meta.operator} />
                <KV k="Part" v={meta.part} />
                <KV k="Cell and fixture" v={meta.fixture} />
                <KV k="Logged at" v={sessionTime(state, d.loggedAt)} />
                <KV k="Effect" v={<span data-testid="lodged-effect">{effect}</span>} />
              </div>
            </Panel>
            <CallList d={d} onCalled={onCalled} />
          </div>
          <div className="flex min-w-0 flex-[1.1] flex-col gap-3.5">
            <TodoList d={d} onTick={onTodo} />
            {(d.note || stop) && (
              <Panel title={stop ? "Why it stops" : "Note"}>
                <p className="text-base text-ink-2">{d.note || "The part cannot be checked until someone clears it."}</p>
              </Panel>
            )}
            {d.done.length > 0 && (
              <Panel title="Already tried">
                <ul className="list-disc pl-6 text-base text-ink-2">
                  {d.done.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-3.5">
          {stop ? (
            <Btn variant="primary" onClick={onBack}>
              Next: mark and hand off
            </Btn>
          ) : (
            <>
              <Btn variant="primary" onClick={onBack}>
                Back to the check
              </Btn>
              {d.proc && (
                <Btn variant="success" onClick={onProcedure}>
                  Open the hole check procedure
                </Btn>
              )}
              {open && <Btn onClick={() => setClearing(true)}>Record the decision and close the hold</Btn>}
            </>
          )}
        </div>
      </div>
      {clearing && (
        <HoldDecisionDialog
          onCancel={() => setClearing(false)}
          onSubmit={(x) => {
            onDecision(x);
            setClearing(false);
          }}
        />
      )}
    </>
  );
}
