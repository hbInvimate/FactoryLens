// /supervisor/team: totals for the team, then one card per Quality Technician for the period, sorted.
// Each card opens Tasks filtered to that person.
import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, cache } from "react";
import { Gate } from "@/components/auth/Gate";
import { Avatar, Card, Chip, StatTile, cx, type ChipTone } from "@/components/ds";
import { IconAlert, IconChecklist, IconClock, IconTarget } from "@/components/ds/icons";
import { Empty, isMissing, load, minutes } from "@/components/supervisor/parts";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { AutoSubmitSelect } from "@/components/tasks/AutoSubmit";
import {
  CHECK_TARGET_SECONDS, TEAM_PERIODS, TEAM_SORTS, TEAM_TAG_LABEL, nearTarget, sortTeam, team, teamFilter,
  type TeamMember, type TeamPeriod, type TeamTag,
} from "@/lib/server/supervisor";

export const metadata = { title: "FactoryLens AI: Team" };

type SP = PageProps<"/supervisor/team">["searchParams"];

/** One query per request, shared by the header line and the body. */
const teamFor = cache((period: TeamPeriod) => load(() => team(period)));

const TAG_TONE: Record<TeamTag, ChipTone> = { top: "green", on_track: "blue", coach: "amber" };
const pctText = (p: number | null) => (p === null ? "—" : `${p}%`);

async function Count({ searchParams }: { searchParams: SP }) {
  const { period } = teamFilter(await searchParams);
  await connection();
  const t = await teamFor(period);
  const n = isMissing(t) ? 0 : t.members.length;
  return (
    <>
      {n} Quality Technician{n === 1 ? "" : "s"} · {TEAM_PERIODS[period]}
    </>
  );
}

async function Filters({ searchParams }: { searchParams: SP }) {
  const { period, sort } = teamFilter(await searchParams);
  return (
    <Form action="/supervisor/team" className="flex flex-wrap items-center gap-3 [&_select]:w-[230px]" data-testid="team-filters">
      <AutoSubmitSelect name="period" value={period} label="Period">
        {Object.entries(TEAM_PERIODS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </AutoSubmitSelect>
      <AutoSubmitSelect name="sort" value={sort} label="Sort">
        {Object.entries(TEAM_SORTS).map(([k, v]) => (
          <option key={k} value={k}>
            Sort: {v}
          </option>
        ))}
      </AutoSubmitSelect>
    </Form>
  );
}

function Stat({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[22px] font-bold" data-testid={testId}>
        {value}
      </span>
      <span className="text-[13px] text-muted">{label}</span>
    </span>
  );
}

/** Average check time against the 45:00 target: the mark is the target; amber within 5% of it, or over. */
function TimeBar({ seconds, median }: { seconds: number | null; median: number | null }) {
  const scale = CHECK_TARGET_SECONDS * 1.25;
  const amber = nearTarget(seconds);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[14px]">
        <span className="text-ink-2">Avg check time</span>
        <span>
          <b className={cx(amber && "text-amber-ink")} data-testid="avg-time">
            {minutes(seconds)}
          </b>
          <span className="text-muted"> / {minutes(CHECK_TARGET_SECONDS)}</span>
          <span className="text-muted" data-testid="median-time">
            {" "}
            · median {minutes(median)}
          </span>
        </span>
      </div>
      <span className="relative block h-3 rounded-full bg-surface-2" data-amber={amber || undefined} data-testid="time-bar">
        {seconds !== null && (
          <span className={cx("absolute inset-y-0 left-0 rounded-full", amber ? "bg-amber" : "bg-primary")} style={{ width: `${Math.min(100, (seconds / scale) * 100)}%` }} />
        )}
        <span className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${(CHECK_TARGET_SECONDS / scale) * 100}%` }} title="Target 45:00" />
      </span>
    </div>
  );
}

function MemberCard({ m }: { m: TeamMember }) {
  return (
    <Link href={`/supervisor/tasks?${new URLSearchParams({ status: "all", who: m.id })}`} className="block rounded-[var(--fl-radius-lg)] outline-offset-2 hover:opacity-90 [&>*]:h-full" aria-label={`${m.name}: open their checks`}>
      <Card className="flex flex-col gap-4 px-5 py-5" testId={`member-${m.id}`}>
        <div className="flex items-center gap-3">
          <Avatar name={m.name} size={44} />
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-[17px] leading-tight break-words">{m.name}</b>
            {m.demo && <span className="text-[13px] text-muted">Demo data</span>}
          </span>
          {m.tag ? (
            <Chip tone={TAG_TONE[m.tag]} size="sm">
              <span data-testid="tag">{TEAM_TAG_LABEL[m.tag]}</span>
            </Chip>
          ) : (
            <Chip size="sm">
              <span data-testid="tag">No score yet</span>
            </Chip>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Checks" value={m.checks} testId="checks" />
          <Stat label="First-time right" value={pctText(m.ftrPct)} testId="ftr" />
          <Stat label="Deviations" value={m.deviations} testId="deviations" />
        </div>
        <TimeBar seconds={m.avgSeconds} median={m.medianSeconds} />
        <p className="truncate text-[14px] text-ink-2" title={m.note} data-testid="note">
          {m.note}
        </p>
      </Card>
    </Link>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { period, sort } = teamFilter(await searchParams);
  await connection();
  const t = await teamFor(period);
  if (isMissing(t)) return <Card className="px-6 py-5 text-[17px]">{t.notConfigured}</Card>;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="team-totals">
        <StatTile icon={<IconTarget />} tone="green" valueTone="green" value={pctText(t.totals.ftrPct)} label="Team first-time right" testId="total-ftr" />
        <StatTile icon={<IconChecklist />} tone="blue" value={t.totals.checks} label={`Checks ${TEAM_PERIODS[period].toLowerCase()}`} testId="total-checks" />
        <StatTile icon={<IconClock />} tone="violet" value={minutes(t.totals.avgSeconds)} label="Avg check time" sub={`Median ${minutes(t.totals.medianSeconds)} · Target ${minutes(CHECK_TARGET_SECONDS)}`} testId="total-time" />
        <StatTile icon={<IconAlert />} tone="amber" valueTone={t.totals.coach ? "amber" : undefined} value={t.totals.coach} label="Need coaching" testId="total-coach" />
      </div>
      {t.members.length === 0 ? (
        <Card className="px-6">
          <Empty>No Quality Technicians yet. An admin adds them with npm run user:create.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="team-cards">
          {sortTeam(t.members, sort).map((m) => (
            <MemberCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </>
  );
}

export default function TeamPage(props: PageProps<"/supervisor/team">) {
  return (
    <Gate area="supervisor" next="/supervisor/team">
      <SupervisorPage
        current="team"
        title="Team"
        sub={
          <Suspense fallback="Quality Technicians">
            <Count searchParams={props.searchParams} />
          </Suspense>
        }
        actions={
          <Suspense fallback={null}>
            <Filters searchParams={props.searchParams} />
          </Suspense>
        }
      >
        <Suspense fallback={<p className="text-[17px] text-muted">Loading…</p>}>
          <Body searchParams={props.searchParams} />
        </Suspense>
      </SupervisorPage>
    </Gate>
  );
}
