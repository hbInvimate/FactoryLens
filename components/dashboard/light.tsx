// Light look for the supervisor dashboard (docs/dashboard/screens): white cards on a light grey page.
import type { ReactNode } from "react";
import { STATUS_LABEL, type SessionStatus } from "@/lib/check/types";
import { cx } from "../ui";

export function Page({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col bg-[#eef0f3] text-[#1b1f24]">{children}</div>;
}

export function Card({ children, className, accent }: { children: ReactNode; className?: string; accent?: "green" | "amber" | "red" | "gray" }) {
  const bar = accent && { green: "border-l-[#2e9e5b]", amber: "border-l-[#d79a12]", red: "border-l-[#c9433a]", gray: "border-l-[#9aa3ad]" }[accent];
  return (
    <div className={cx("rounded-xl border border-[#dfe3e8] bg-white", accent && "border-l-[5px]", bar, className)}>{children}</div>
  );
}

export function StatCard({ value, label, sub, accent, testId }: { value: ReactNode; label: string; sub?: ReactNode; accent?: "green" | "amber" | "red" | "gray"; testId?: string }) {
  return (
    <Card accent={accent} className="flex min-w-0 flex-col px-4 py-3">
      <span className="text-[30px] font-semibold leading-tight" data-testid={testId}>
        {value}
      </span>
      <span className="text-[15px] text-[#2b3138]">{label}</span>
      {sub !== undefined && <span className="text-[13px] text-[#6b7480]">{sub}</span>}
    </Card>
  );
}

const CHIP = {
  green: "bg-[#e3f5ea] text-[#1e8a4a]",
  amber: "bg-[#fdf1d6] text-[#a36f00]",
  red: "bg-[#fbe3e1] text-[#c0392b]",
  gray: "bg-[#eceff3] text-[#4b5563]",
  blue: "bg-[#e3edfc] text-[#1f5fcf]",
};

export function LChip({ tone, children }: { tone: keyof typeof CHIP; children: ReactNode }) {
  return <span className={cx("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold", CHIP[tone])}>{children}</span>;
}

const STATUS_TONE: Record<SessionStatus, keyof typeof CHIP> = {
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

export function Note() {
  return (
    <p className="rounded-lg border border-[#f1d58a] bg-[#fff8e3] px-3 py-2 text-[14px] text-[#6b5200]">
      Anyone with the link can open this page. Use test data only.
    </p>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-xl bg-white" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-white" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
