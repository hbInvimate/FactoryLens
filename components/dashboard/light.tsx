// Dashboard pieces on the shared design system (components/ds): white cards on the light page.
import type { ReactNode } from "react";
import { Card, Chip, StatTile, type ChipTone, type TileTone } from "@/components/ds";
import { STATUS_LABEL, type SessionStatus } from "@/lib/check/types";

export { Card };

/** The content column inside the sidebar shell. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col bg-page text-ink print:bg-surface">{children}</div>;
}

export function StatCard({ icon, tone, value, label, sub, testId, valueTone }: { icon: ReactNode; tone: TileTone; value: ReactNode; label: string; sub?: ReactNode; testId?: string; valueTone?: "green" | "amber" | "red" }) {
  return <StatTile icon={icon} tone={tone} value={value} label={label} sub={sub} testId={testId} valueTone={valueTone} />;
}

export function LChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <Chip tone={tone} size="sm">
      {children}
    </Chip>
  );
}

const STATUS_TONE: Record<SessionStatus, ChipTone> = {
  running: "blue",
  paused: "gray",
  on_hold: "amber",
  stopped: "amber",
  complete: "green",
  part_held: "red",
  left: "gray",
  scrapped: "red",
  rework: "amber",
  concession: "amber",
};

export function StatusPill({ status }: { status: SessionStatus }) {
  return <LChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</LChip>;
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-card border border-line bg-surface" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-[var(--fl-radius-md)] bg-surface" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
