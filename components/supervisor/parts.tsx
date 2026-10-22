// Small pieces shared by the Supervisor pages.
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ds";
import { NotConfigured } from "@/lib/server/repo";

/** A KPI card that opens the page with the detail. */
export function KpiLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="block rounded-[var(--fl-radius-lg)] outline-offset-2 hover:opacity-90 [&>*]:h-full">
      {children}
    </Link>
  );
}

/** No data yet: a placeholder line in the card. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[16px] text-muted">{children}</p>;
}

export function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <Card className="flex flex-col gap-3 px-5 py-5" testId={testId}>
      <h2 className="text-[20px] font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** Runs a loader; with no database, the page shows why instead of failing. */
export async function load<T>(f: () => Promise<T>): Promise<T | { notConfigured: string }> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof NotConfigured) return { notConfigured: e.message };
    throw e;
  }
}

export const isMissing = (v: unknown): v is { notConfigured: string } => typeof v === "object" && v !== null && "notConfigured" in v;

export const minutes = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
