import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LocalTime } from "@/components/LocalTime";
import { PageBar } from "@/components/PageBar";
import { StatusChip } from "@/components/StatusChip";
import { getRepo, NotConfigured } from "@/lib/server/repo";
import { NotConfiguredNotice, TableSkeleton } from "./shared";

export const metadata = { title: "FactoryLens AI: session history" };

async function SessionTable() {
  await connection();
  let rows;
  try {
    rows = await getRepo().list(200);
  } catch (e) {
    if (e instanceof NotConfigured) return <NotConfiguredNotice />;
    throw e;
  }
  if (!rows.length) {
    return (
      <p className="text-[19px] text-soft">
        No checks yet. <Link href="/" className="text-blue-text underline">Start one</Link>.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[14px] bg-panel2">
      <table className="w-full min-w-[1100px] text-left text-[17px]">
        <thead className="text-[15px] text-muted">
          <tr className="border-b border-line">
            <th className="px-5 py-3 font-medium">Started</th>
            <th className="px-3 py-3 font-medium">Part</th>
            <th className="px-3 py-3 font-medium">Cell and fixture</th>
            <th className="px-3 py-3 font-medium">Quality Technician</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Steps</th>
            <th className="px-3 py-3 font-medium">Check points</th>
            <th className="px-3 py-3 font-medium">Deviations</th>
            <th className="px-3 py-3 font-medium">Discrepancies</th>
            <th className="px-5 py-3 font-medium">Conformance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 hover:bg-panel">
              <td className="px-5 py-1">
                <Link href={`/sessions/${r.id}`} className="tap inline-flex items-center font-medium text-blue-text underline-offset-4 hover:underline">
                  <LocalTime iso={r.startedAt.toISOString()} />
                </Link>
              </td>
              <td className="px-3">{r.part}</td>
              <td className="px-3">{r.fixture}</td>
              <td className="px-3">{r.operatorLabel}</td>
              <td className="px-3"><StatusChip status={r.status} /></td>
              <td className="px-3">{r.stepsDone} / 12</td>
              <td className="px-3">{r.checkPoints} / 50</td>
              <td className="px-3">{r.deviations}</td>
              <td className="px-3">{r.discrepancies}</td>
              <td className="px-5">{r.conformance === null ? (r.status === "part_held" ? "No score" : "—") : `${r.conformance}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SessionsPage() {
  return (
    <>
      <PageBar title="Session history" current="sessions" />
      <main className="flex flex-1 flex-col gap-5 px-8 py-7">
        <h1 className="text-[30px] font-semibold">Session history</h1>
        <Suspense fallback={<TableSkeleton />}>
          <SessionTable />
        </Suspense>
      </main>
    </>
  );
}
