// /supervisor: the Supervisor's Home. KPIs for now and the last 7 days, a one-line summary, ongoing checks with
// Watch, alerts, and the recent completed checks. Read-only: Watch opens the live view of the check.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { BigRing, StepBars, StepSquares } from "@/components/check/CheckMetrics";
import { confTone } from "@/lib/conformance-tone";
import { ButtonLink, Card, Chip, Table, Td, Th, cx } from "@/components/ds";
import { CountUp } from "@/components/ds/CountUp";
import { LocalTime } from "@/components/LocalTime";
import { StatusChip } from "@/components/StatusChip";
import { isMissing, load } from "@/components/supervisor/parts";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { fmtClock, fmtDuration } from "@/lib/format";
import { homeWeek, overview, type HomeWeek, type Overview } from "@/lib/server/supervisor";

export const metadata = { title: "FactoryLens AI: Supervisor" };

const KPI = "flex h-full min-w-0 flex-col gap-2 rounded-[22px] border border-line bg-surface px-5 py-4 shadow-card";
const LABEL = "text-[15px] text-muted";

/** A dashed empty state. */
function Dashed({ children, testId }: { children: string; testId?: string }) {
  return (
    <p className="rounded-[16px] border-2 border-dashed border-line px-4 py-6 text-center text-[16px] text-muted" data-testid={testId}>
      {children}
    </p>
  );
}

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** One sentence: the floor now, the last 7 days, and any assigned check not started. Built from the numbers only. */
function summary(o: Overview, w: HomeWeek): { lead: string; rest: string } {
  const lead = o.ongoing.length ? `${o.ongoing.length} ${o.ongoing.length === 1 ? "check" : "checks"} running${o.onHold ? `, ${o.onHold} on hold` : ""}.` : "No checks running.";
  const week = w.completed
    ? `Last 7 days: ${w.completed} completed ${w.completed === 1 ? "check" : "checks"}, ${w.allRight === w.completed ? (w.completed === 1 ? "right first time" : "all right first time") : `${w.allRight} right first time`}${w.avgCycleSeconds !== null && w.taktSeconds !== null ? `, average cycle ${fmtClock(w.avgCycleSeconds * 1000)} of ${fmtClock(w.taktSeconds * 1000)} takt` : ""}.`
    : "No completed checks in the last 7 days.";
  const waiting = w.notStarted.count
    ? ` ${w.notStarted.count} assigned ${w.notStarted.count === 1 ? "check is" : "checks are"} still not started${w.notStarted.oldest ? ` (oldest ${dayMonth(w.notStarted.oldest)})` : ""}.`
    : "";
  return { lead, rest: `${week}${waiting}` };
}

async function Body() {
  await connection();
  const [o, w] = await Promise.all([load(() => overview()), load(() => homeWeek())]);
  if (isMissing(o)) return <Card className="px-6 py-5 text-[17px]">{o.notConfigured}</Card>;
  if (isMissing(w)) return <Card className="px-6 py-5 text-[17px]">{w.notConfigured}</Card>;
  const s = summary(o, w);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr_1.35fr]">
        <Link href="/supervisor/tasks?status=in_progress" className={cx(KPI, "flex-row items-center gap-4 hover:opacity-90")} data-testid="kpi-ongoing">
          <BigRing value={o.ongoing.length} of={Math.max(1, o.ongoing.length)} size={88} label={String(o.ongoing.length)} />
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>In progress</span>
            <span className="text-[22px] leading-tight font-bold">{o.ongoing.length ? (o.onHold ? `${o.onHold} on hold` : "Running") : "Floor quiet"}</span>
            <span className="text-[14px] text-muted" data-testid="kpi-hold">
              {o.onHold} on hold
            </span>
          </span>
        </Link>
        <Link href="/supervisor/tasks?status=completed" className={cx(KPI, "flex-row items-center gap-4 hover:opacity-90")} data-testid="kpi-completed">
          <BigRing value={w.allRight} of={w.completed} size={88} />
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>Completed · 7 days</span>
            <span className="text-[22px] leading-tight font-bold">{w.completed === 0 ? "None yet" : w.allRight === w.completed ? "All passed" : `${w.completed - w.allRight} redone`}</span>
            <span className="text-[14px] text-muted">
              {w.left} left, {w.closed} closed
            </span>
          </span>
        </Link>
        <Link href="/supervisor/analytics" className={cx(KPI, "hover:opacity-90")} data-testid="kpi-ftr">
          <span className={LABEL}>Conformance · right first time · 7 days</span>
          <span className="flex items-baseline gap-3">
            <span className={cx("text-[44px] leading-none font-bold", confTone(w.conformancePct))}>{w.conformancePct === null ? "—" : <CountUp text={`${w.conformancePct}%`} />}</span>
            <span className="text-[15px] text-muted">
              {w.allRight} of {w.completed} checks
            </span>
          </span>
          {w.stepLooks && <StepSquares looks={w.stepLooks} testId="home-squares" />}
          <span className="text-[14px] text-muted">
            {w.stepLooks === null ? "No completed checks yet" : w.stepLooks.every((l) => l === "right") ? "Every step right first time in every check" : `Redone: step ${w.stepLooks.flatMap((l, i) => (l === "redone" ? [i + 1] : [])).join(", ")}`}
          </span>
        </Link>
        <Link href="/supervisor/analytics" className={cx(KPI, "hover:opacity-90")} data-testid="kpi-cycle">
          <div className="flex items-start justify-between gap-3">
            <span className="flex flex-col">
              <span className={LABEL}>Avg cycle time · 7 days</span>
              <span className="text-[44px] leading-none font-bold tabular-nums">{w.avgCycleSeconds === null ? "—" : fmtClock(w.avgCycleSeconds * 1000)}</span>
            </span>
            <span className="flex flex-col items-end">
              <span className={LABEL}>Takt</span>
              <span className="text-[24px] font-bold text-ink-2 tabular-nums">{w.taktSeconds === null ? "—" : fmtClock(w.taktSeconds * 1000)}</span>
            </span>
          </div>
          <StepBars steps={w.stepTimes} testId="home-bars" />
          <span className="flex flex-wrap gap-x-3 text-[13px] text-muted">
            <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-primary" />on time</span>
            <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-amber" />over</span>
            <span><i className="mr-1 inline-block size-2.5 rounded-sm border border-dashed border-line-strong" />step target · avg per step</span>
          </span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-primary-line bg-primary-soft px-5 py-4" data-testid="ai-banner">
        <span className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-[15px] font-bold text-on-strong">AI</span>
        <p className="min-w-0 flex-1 text-[16px] text-ink">
          <b className="text-primary-ink">{s.lead}</b> {s.rest}
        </p>
        <ButtonLink variant="primary" href="/supervisor/tasks">
          Open Tasks
        </ButtonLink>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="flex flex-col gap-3 rounded-[22px] px-5 py-5" testId="ongoing">
          <h2 className="text-[20px] font-semibold">Ongoing checks</h2>
          {o.ongoing.length === 0 ? (
            <Dashed>No check is running right now. New checks appear here live.</Dashed>
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
                      <ButtonLink href={`/supervisor/live/${c.id}`} className="min-h-[56px] px-4 text-[15px] shadow-none" aria-label={`Watch ${c.part}`}>
                        Watch
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="flex flex-col gap-3 rounded-[22px] px-5 py-5" testId="alerts">
          <h2 className="text-[20px] font-semibold">Alerts</h2>
          {o.alerts.length === 0 ? (
            <Dashed>No alerts right now.</Dashed>
          ) : (
            <ul className="flex flex-col">
              {o.alerts.map((a) => (
                <li key={`${a.id}-${a.text}`} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                  <Chip tone={a.tone} size="sm">
                    {a.tone === "red" ? "Hold" : "Check"}
                  </Chip>
                  <span className="flex-1 text-[15px]">{a.text}</span>
                  <ButtonLink href={`/supervisor/live/${a.id}`} className="min-h-[56px] px-3 text-[14px] shadow-none">
                    Watch
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-3 rounded-[22px] px-5 py-5" testId="recent-completed">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="flex-1 text-[20px] font-semibold">Recent completed checks</h2>
          <span className="text-[14px] text-muted">
            Last 7 days ·{" "}
            <Link href="/supervisor/tasks?status=completed" className="font-semibold text-primary-ink underline">
              See all in Tasks
            </Link>
          </span>
        </div>
        {w.recent.length === 0 ? (
          <Dashed>No completed checks in the last 7 days.</Dashed>
        ) : (
          <Table minWidth={980}>
            <thead>
              <tr>
                <Th>Finished</Th>
                <Th>Quality Technician</Th>
                <Th>Part · Station</Th>
                <Th>Result</Th>
                <Th>Cycle time</Th>
                <Th>Conformance</Th>
                <Th>Deviations</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {w.recent.map((r) => (
                <tr key={r.id} data-session={r.id}>
                  <Td className="font-semibold whitespace-nowrap">
                    <LocalTime iso={r.finishedAt} />
                  </Td>
                  <Td>{r.technician}</Td>
                  <Td>
                    <span className="flex flex-col">
                      <span>{r.part}</span>
                      <span className="text-[13px] text-muted">{r.station}</span>
                    </span>
                  </Td>
                  <Td>
                    <StatusChip status={r.status} />
                  </Td>
                  <Td className="tabular-nums">
                    <span className="flex flex-col">
                      <b>{r.cycleSeconds === null ? "—" : fmtDuration(r.cycleSeconds)}</b>
                      {w.taktSeconds !== null && <span className="text-[13px] text-muted">of {fmtClock(w.taktSeconds * 1000)}</span>}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-28 rounded-full bg-surface-2">
                        <span className={cx("block h-full rounded-full", (r.conformance ?? 0) >= 90 ? "bg-primary" : (r.conformance ?? 0) >= 75 ? "bg-amber" : "bg-red")} style={{ width: `${r.conformance ?? 0}%` }} />
                      </span>
                      <b className={confTone(r.conformance)}>{r.conformance === null ? "—" : `${r.conformance}%`}</b>
                    </span>
                  </Td>
                  <Td>{r.deviations}</Td>
                  <Td>
                    <ButtonLink href={`/supervisor/live/${r.id}`} className="min-h-[56px] px-4 text-[15px] shadow-none">
                      Watch replay
                    </ButtonLink>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export default function SupervisorHome() {
  return (
    <Gate area="supervisor" next="/supervisor">
      <SupervisorPage current="home" title="Home" sub="Checks on the floor right now, and the last 7 days. Read-only.">
        <Suspense fallback={<p className="text-[17px] text-muted">Loading…</p>}>
          <Body />
        </Suspense>
      </SupervisorPage>
    </Gate>
  );
}
