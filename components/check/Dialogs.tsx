"use client";
import { useState, type ReactNode } from "react";
import { UNDO_WINDOW_MS } from "@/lib/check/reducer";
import type { Action } from "@/lib/check/types";
import { IDLE_PAUSE_MINUTES } from "@/lib/config";
import { Btn, cx } from "../ui";

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx("flex max-h-full w-full flex-col gap-4 overflow-y-auto rounded-2xl border-2 border-line-strong bg-surface p-7", wide ? "max-w-[880px]" : "max-w-[640px]")}
      >
        <h2 className="text-[28px] font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ClipDialog({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-3 text-[18px] text-muted">Clip placeholder</div>
      <p className="text-[18px] text-ink-2">Clips are saved here once video capture is connected. The supervisor dashboard will show them.</p>
      <div className="flex justify-end">
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

/** The latest pause was the 10-minute idle pause. */
export function pausedForIdle(actions: Action[]): boolean {
  const last = actions.filter((a) => a.type === "pause").sort((a, b) => b.seq - a.seq)[0];
  return last?.type === "pause" && last.idle === true;
}

export function PausedOverlay({ onResume, reason, idle }: { onResume: () => void; reason?: string; idle?: boolean }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Paused" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-page/95 p-8">
      <h1 className="text-[56px] font-semibold">Paused</h1>
      {idle ? (
        <p className="max-w-[640px] text-center text-[22px] text-ink-2" data-testid="idle-paused">
          Paused: no activity for {IDLE_PAUSE_MINUTES} min. The timer has stopped. Keep the part as it is.
        </p>
      ) : (
        <p className="max-w-[640px] text-center text-[22px] text-ink-2">
          The check is paused and kept{reason ? ` (${reason})` : ""}. The timer has stopped. Keep the part as it is.
        </p>
      )}
      <Btn variant="success" className="min-h-[72px] px-14 text-[26px]" onClick={onResume}>
        Resume
      </Btn>
    </div>
  );
}

const LEAVE_REASONS = ["Break", "End of shift", "Called away", "Wrong part or session", "Other"];

/** Leaving pauses the check and keeps it. It can be resumed from the start page or the history. */
export function LeaveDialog({
  onStay, onLeave, body, confirm = "Leave the check",
}: {
  onStay: () => void;
  onLeave: (reason: string) => void;
  body?: string;
  confirm?: string;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const reason = pick === "Other" ? text.trim() : pick;
  return (
    <Modal title="Leave this check?" onClose={onStay}>
      <p className="text-[19px] text-ink-2">
        {body ?? "The check is paused and kept on this device and the server. You can resume it later."} Why are you leaving?
      </p>
      <div className="flex flex-wrap gap-2.5">
        {LEAVE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={pick === r}
            onClick={() => setPick(r)}
            className={cx("tap rounded-[var(--fl-radius-md)] border px-5 text-[19px]", pick === r ? "border-blue bg-blue-soft" : "border-line-strong")}
          >
            {r}
          </button>
        ))}
      </div>
      {pick === "Other" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-base text-muted">Say why</span>
          <input
            autoFocus
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            className="tap rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[20px]"
          />
        </label>
      )}
      <div className="flex justify-end gap-3">
        <Btn onClick={onStay}>Stay</Btn>
        <Btn variant="primary" disabled={!reason} onClick={() => reason && onLeave(reason)}>
          {confirm}
        </Btn>
      </div>
    </Modal>
  );
}

function describe(a: Action): string {
  switch (a.type) {
    case "tap_point":
      return `${a.point} confirmed`;
    case "next_step":
      return `Step ${a.step} marked done`;
    case "release_clamps":
      return "Clamps released";
    case "handoff":
      return { marks: "Marks done", photo: "Photo added", sheet: "Handoff sheet done", handed_over: "Handed over" }[a.item];
    case "todo_tick":
    case "proc_tick":
      return "Item ticked";
    case "call_marked":
      return `${a.who} marked as called`;
    case "proc_holes":
      return "Holes updated";
    case "proc_parts":
      return "Parts on hold changed";
    default:
      return "Last tap";
  }
}

export function UndoToast({ action, now, onUndo }: { action: Action; now: number; onUndo: () => void }) {
  const left = Math.min(UNDO_WINDOW_MS / 1000, Math.max(0, Math.ceil((UNDO_WINDOW_MS - (now - action.at)) / 1000)));
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-5 rounded-2xl border-2 border-line-strong bg-surface py-2 pl-6 pr-2 shadow-2xl">
      <span className="text-[19px]">{describe(action)}.</span>
      <Btn variant="primary" onClick={onUndo}>
        Undo ({left} s)
      </Btn>
    </div>
  );
}
