"use client";
import Link from "next/link";
import type { SessionMeta } from "@/lib/check/types";
import type { SyncState } from "@/lib/client/useCheckSession";
import { Dot, Info, Logo, cx } from "../ui";

function Connection({ sync }: { sync: SyncState }) {
  const [color, text] = sync.offline
    ? (["amber", "Offline"] as const)
    : sync.error
      ? (["red", "Save failed"] as const)
      : sync.saving || sync.pending
        ? (["blue", "Saving"] as const)
        : (["green", "Connected"] as const);
  return (
    <span className="flex items-center gap-2 text-base text-ink-2" data-testid="connection">
      <Dot color={color} />
      {text}
    </span>
  );
}

function BarButton({ onClick, children, pressed, label }: { onClick: () => void; children: React.ReactNode; pressed?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={cx(
        "tap rounded-[var(--fl-radius-md)] border px-3.5 text-[17px] font-semibold",
        pressed ? "border-primary bg-primary-soft text-primary-ink" : "border-line-strong bg-surface text-ink hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

export function TopBar({
  meta, sync, voice, onVoice, onPause, onLeave, canPause,
}: {
  meta: SessionMeta;
  sync: SyncState;
  voice: boolean;
  onVoice: () => void;
  onPause: () => void;
  onLeave: () => void;
  canPause: boolean;
}) {
  return (
    <header className="flex min-h-[72px] flex-none flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface px-5 py-2">
      <Logo />
      <span aria-hidden className="h-9 w-px bg-line" />
      <Info label="Part" value={meta.part} />
      <Info label="SOP" value={meta.sop} />
      <Info label="Cell and fixture" value={meta.fixture} />
      <Info label="Quality Technician" value={meta.operator} />
      <span className="flex-1" />
      <span className="flex items-center gap-4">
        <Connection sync={sync} />
        <span className="flex items-center gap-2 text-base text-ink-2">
          <Dot color="red" />
          REC
        </span>
        <span className="flex items-center gap-2 text-base text-ink-2">
          <Dot color="gray" />
          Edge mode
        </span>
      </span>
      <div className="flex gap-2">
        <BarButton onClick={onVoice} pressed={voice} label={voice ? "Voice on" : "Voice off"}>
          {voice ? "Voice on" : "Voice off"}
        </BarButton>
        {canPause && <BarButton onClick={onPause}>Pause</BarButton>}
        <Link href="/dashboard" className="tap inline-flex items-center rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3.5 text-[17px] font-semibold text-ink hover:bg-surface-2">
          Dashboard
        </Link>
        <BarButton onClick={onLeave}>Leave</BarButton>
      </div>
    </header>
  );
}

/** Shown under the top bar when saves are queued or failing. Work always continues. */
export function SyncNotice({ sync, onRetry }: { sync: SyncState; onRetry: () => void }) {
  if (sync.localFull) {
    return (
      <div role="alert" className="flex flex-none items-center gap-4 bg-red-soft px-8 py-2 text-[18px] text-red-ink">
        This device could not store a copy of the check. Keep the page open until it shows Connected.
      </div>
    );
  }
  if (sync.offline) {
    return (
      <div role="status" data-testid="offline-banner" className="flex flex-none items-center gap-4 bg-amber-soft px-8 py-2 text-[18px] text-amber-ink">
        <Dot color="amber" />
        No connection. Keep working. {sync.pending} {sync.pending === 1 ? "save is" : "saves are"} queued on this device and will be sent automatically.
      </div>
    );
  }
  if (sync.error) {
    return (
      <div role="alert" data-testid="save-error" className="flex flex-none flex-wrap items-center gap-4 bg-red-soft px-8 py-1.5 text-[18px] text-red-ink">
        <Dot color="red" />
        <span>
          Could not save: {sync.error} Your work is kept on this device ({sync.pending} waiting).
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onRetry} className="tap rounded-[var(--fl-radius-md)] border border-red bg-surface px-5 text-[18px] font-semibold text-red-ink hover:bg-red-soft">
          Retry
        </button>
      </div>
    );
  }
  return null;
}
