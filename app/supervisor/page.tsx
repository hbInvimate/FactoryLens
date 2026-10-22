// /supervisor: the Supervisor's home. 4 KPI cards (each opens Tasks or Analytics), the checks in progress
// with Watch, and alerts. Read-only: Watch opens the session's page.
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { ButtonLink, Card, Chip, StatTile, Table, Td, Th } from "@/components/ds";
import { IconAlert, IconChecklist, IconPlay, IconTarget } from "@/components/ds/icons";
import { LocalTime } from "@/components/LocalTime";
import { StatusChip } from "@/components/StatusChip";
import { Empty, KpiLink, Section, isMissing, load } from "@/components/supervisor/parts";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { overview } from "@/lib/server/supervisor";

export const metadata = { title: "FactoryLens AI: Supervisor" };

async function Body() {
  await connection();
  const o = await load(() => overview());
  if (isMissing(o)) return <Card className="px-6 py-5 text-[17px]">{o.notConfigured}</Card>;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiLink href="/supervisor/tasks?status=in_progress">
          <StatTile icon={<IconPlay />} tone="blue" value={o.ongoing.length} label="Checks in progress" testId="kpi-ongoing" />
        </KpiLink>
        <KpiLink href="/supervisor/tasks?status=all">
          <StatTile icon={<IconChecklist />} tone="green" value={o.checksToday} label="Checks started today" testId="kpi-today" />
        </KpiLink>
        <KpiLink href="/supervisor/analytics">
          <StatTile
            icon={<IconTarget />}
            tone="violet"
            value={o.ftrPct === null ? "—" : `${o.ftrPct}%`}
            label="First-time right, last 7 days"
            sub={o.completed7 ? `${o.completed7} completed checks` : "No completed checks yet"}
            testId="kpi-ftr"
          />
        </KpiLink>
        <KpiLink href="/supervisor/tasks?status=in_progress">
          <StatTile icon={<IconAlert />} tone={o.onHold ? "red" : "amber"} value={o.onHold} label="On hold now" valueTone={o.onHold ? "red" : undefined} testId="kpi-hold" />
        </KpiLink>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Section title="Ongoing checks" testId="ongoing">
          {o.ongoing.length === 0 ? (
            <Empty>No check is in progress right now.</Empty>
          ) : (
            <Table minWidth={640}>
              <thead>
                <tr>
                  <Th>Part and station</Th>
                  <Th>Quality Technician</Th>
                  <Th>Step</Th>
                  <Th>Status</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {o.ongoing.map((c) => (
                  <tr key={c.id} data-session={c.id}>
                    <Td>
                      <span className="flex flex-col">
                        <b>{c.part}</b>
                        <span className="text-[14px] text-muted">
                          {c.station} · started <LocalTime iso={c.startedAt} timeOnly />
                        </span>
                      </span>
                    </Td>
                    <Td>{c.operator}</Td>
                    <Td>{c.step} of 12</Td>
                    <Td>
                      <StatusChip status={c.status} />
                    </Td>
                    <Td>
                      <ButtonLink href={`/sessions/${c.id}`} className="min-h-[56px] px-4 text-[15px] shadow-none" aria-label={`Watch ${c.part}`}>
                        Watch
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
        <Section title="Alerts" testId="alerts">
          {o.alerts.length === 0 ? (
            <Empty>No alerts right now.</Empty>
          ) : (
            <ul className="flex flex-col">
              {o.alerts.map((a) => (
                <li key={`${a.id}-${a.text}`} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                  <Chip tone={a.tone} size="sm">
                    {a.tone === "red" ? "Hold" : "Check"}
                  </Chip>
                  <span className="flex-1 text-[15px]">{a.text}</span>
                  <ButtonLink href={`/sessions/${a.id}`} className="min-h-[56px] px-3 text-[14px] shadow-none">
                    Watch
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

export default function SupervisorHome() {
  return (
    <Gate area="supervisor" next="/supervisor">
      <SupervisorPage current="home" title="Home" sub="Checks on the floor right now. Read-only.">
        <Suspense fallback={<p className="text-[17px] text-muted">Loading…</p>}>
          <Body />
        </Suspense>
      </SupervisorPage>
    </Gate>
  );
}
