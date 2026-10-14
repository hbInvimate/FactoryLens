"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ENDED_WITHOUT_CHECK, type SessionStatus } from "@/lib/check/types";
import { useNow } from "@/lib/client/hooks";
import { conformanceLabel, isOnHold, waitTone } from "@/lib/dashboard/metrics";
import { fmtClock } from "@/lib/format";
import { cx } from "../ui";
import { LocalTime } from "../LocalTime";
import { StatusPill } from "./light";

export interface TableHold {
  step: number;
  issue: string;
  category: string;
  effect: string;
  startedAt: string;
}

export interface TableRow {
  id: string;
  startedAt: string;
  operator: string;
  status: SessionStatus;
  conformance: number | null;
  deviations: number;
  discrepancies: number;
  activeSeconds: number | null;
  hold: TableHold | null;
}

function timeText(r: TableRow): string {
  if (r.status === "running" || r.status === "paused") return "In progress";
  if (r.status !== "complete") return "Not counted";
  return r.activeSeconds === null ? "not recorded" : fmtClock(r.activeSeconds * 1000);
}

const WAIT = { amber: "text-[#a36f00]", red: "font-semibold text-[#c0392b]" };

/** The hold reason and its waiting time, amber, then red once over the limit in lib/config.ts. */
export function HoldCell({ hold, now }: { hold: TableHold; now: number }) {
  const waited = now ? Math.max(0, now - new Date(hold.startedAt).getTime()) : null;
  const tone = waited === null ? "amber" : waitTone(waited);
  return (
    <div className="flex flex-col gap-0.5 pt-1 text-[13px]">
      <span className="text-[#4b5563]">
        Step {hold.step || "—"}: {hold.issue} · {hold.effect === "stop" ? "check stopped" : "check continues"}
      </span>
      <span data-testid="hold-wait" data-tone={tone} className={WAIT[tone]}>
        Waiting {waited === null ? "…" : fmtClock(waited)}
      </span>
    </div>
  );
}

/** Waiting time of an open hold, ticking, amber then red. */
export function LiveWait({ since }: { since: string }) {
  const now = useNow(1000);
  const waited = now ? Math.max(0, now - new Date(since).getTime()) : null;
  const tone = waited === null ? "amber" : waitTone(waited);
  return (
    <span data-testid="report-hold-wait" data-tone={tone} className={WAIT[tone]}>
      {waited === null ? "…" : fmtClock(waited)} and counting
    </span>
  );
}

/** "oldest waiting 34:10", ticking, coloured like the table. */
export function OldestHoldAge({ since }: { since: string }) {
  const now = useNow(1000);
  const waited = now ? Math.max(0, now - new Date(since).getTime()) : null;
  const tone = waited === null ? "amber" : waitTone(waited);
  return (
    <span data-testid="oldest-hold" data-tone={tone} className={WAIT[tone]}>
      oldest waiting {waited === null ? "…" : fmtClock(waited)}
    </span>
  );
}

/** Newest first. Click a row to open the session report. */
export function SessionsTable({ rows, query = "" }: { rows: TableRow[]; /** The dashboard filters, carried to the report so its back link restores them. */ query?: string }) {
  const router = useRouter();
  const now = useNow(1000);
  return (
    <div className="overflow-x-auto rounded-xl border border-[#dfe3e8] bg-white">
      <table className="w-full min-w-[980px] text-left text-[15px]">
        <thead className="bg-[#f6f7f9] text-[14px] text-[#4b5563]">
          <tr>
            <th className="px-4 py-3 font-semibold">Date and time</th>
            <th className="px-3 py-3 font-semibold">Quality Technician</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Conformance</th>
            <th className="px-3 py-3 font-semibold">Deviations</th>
            <th className="px-3 py-3 font-semibold">Discrepancies</th>
            <th className="px-4 py-3 font-semibold">Check time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-session={r.id}
              onClick={() => router.push(`/dashboard/${r.id}${query ? `?${query}` : ""}`)}
              className="cursor-pointer border-t border-[#eceff3] align-top hover:bg-[#f3f7fe]"
            >
              <td className="px-4 py-1">
                <Link href={`/dashboard/${r.id}${query ? `?${query}` : ""}`} className="inline-flex min-h-[56px] items-center font-medium text-[#1f5fcf] hover:underline" onClick={(e) => e.stopPropagation()}>
                  <LocalTime iso={r.startedAt} />
                </Link>
              </td>
              <td className="px-3 py-4">{r.operator}</td>
              <td className="max-w-[360px] px-3 py-3.5">
                <StatusPill status={r.status} />
                {isOnHold(r.status) && r.hold && <HoldCell hold={r.hold} now={now} />}
              </td>
              <td className={cx("px-3 py-4", ENDED_WITHOUT_CHECK.includes(r.status) && "text-[#6b7480]")} data-testid="row-conformance">
                {conformanceLabel(r.status, r.conformance)}
              </td>
              <td className="px-3 py-4">{r.deviations}</td>
              <td className="px-3 py-4">{r.discrepancies}</td>
              <td className="px-4 py-4">{timeText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
