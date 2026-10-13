"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionStatus } from "@/lib/check/types";
import { fmtClock } from "@/lib/format";
import { LocalTime } from "../LocalTime";
import { StatusPill } from "./light";

export interface TableRow {
  id: string;
  startedAt: string;
  operator: string;
  status: SessionStatus;
  conformance: number | null;
  deviations: number;
  discrepancies: number;
  activeSeconds: number | null;
}

const NOT_SCORED: SessionStatus[] = ["part_held", "left"];

function conformanceText(r: TableRow): string {
  if (NOT_SCORED.includes(r.status)) return "Not scored";
  return r.conformance === null ? "Not finished" : `${r.conformance}%`;
}

function timeText(r: TableRow): string {
  if (NOT_SCORED.includes(r.status)) return "Not counted";
  if (r.conformance === null) return "Not finished";
  return r.activeSeconds === null ? "not recorded" : fmtClock(r.activeSeconds * 1000);
}

/** Newest first. Click a row to open the session report. */
export function SessionsTable({ rows }: { rows: TableRow[] }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-xl border border-[#dfe3e8] bg-white">
      <table className="w-full min-w-[900px] text-left text-[15px]">
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
              onClick={() => router.push(`/dashboard/${r.id}`)}
              className="cursor-pointer border-t border-[#eceff3] hover:bg-[#f3f7fe]"
            >
              <td className="px-4 py-1">
                <Link href={`/dashboard/${r.id}`} className="inline-flex min-h-[56px] items-center font-medium text-[#1f5fcf] hover:underline" onClick={(e) => e.stopPropagation()}>
                  <LocalTime iso={r.startedAt} />
                </Link>
              </td>
              <td className="px-3">{r.operator}</td>
              <td className="px-3">
                <StatusPill status={r.status} />
              </td>
              <td className="px-3" data-testid="row-conformance">{conformanceText(r)}</td>
              <td className="px-3">{r.deviations}</td>
              <td className="px-3">{r.discrepancies}</td>
              <td className="px-4">{timeText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
