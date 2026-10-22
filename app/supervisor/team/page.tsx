// /supervisor/team: one card per Quality Technician with their last 30 days.
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Avatar, ButtonLink, Card, Chip } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { Empty, isMissing, load, minutes } from "@/components/supervisor/parts";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { STATUS_LABEL } from "@/lib/check/types";
import { team } from "@/lib/server/supervisor";

export const metadata = { title: "FactoryLens AI: Team" };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex flex-col">
      <span className="text-[22px] font-bold">{value}</span>
      <span className="text-[13px] text-muted">{label}</span>
    </span>
  );
}

async function Body() {
  await connection();
  const people = await load(() => team());
  if (isMissing(people)) return <Card className="px-6 py-5 text-[17px]">{people.notConfigured}</Card>;
  if (people.length === 0)
    return (
      <Card className="px-6">
        <Empty>No Quality Technicians yet. An admin adds them with npm run user:create.</Empty>
      </Card>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {people.map((p) => (
        <Card key={p.id} className="flex flex-col gap-4 px-5 py-5" testId={`member-${p.id}`}>
          <div className="flex items-center gap-3">
            <Avatar name={p.name} size={44} />
            <span className="flex flex-1 flex-col">
              <b className="text-[17px]">{p.name}</b>
              <span className="text-[14px] text-muted">
                {p.lastAt ? (
                  <>
                    Last check <LocalTime iso={p.lastAt} />
                  </>
                ) : (
                  "No checks yet"
                )}
              </span>
            </span>
            {p.current ? (
              <Chip tone="blue" size="sm">
                {STATUS_LABEL[p.current.status]}
              </Chip>
            ) : (
              <Chip size="sm">Idle</Chip>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Checks, 30 days" value={p.checks30} />
            <Stat label="Completed" value={p.completed30} />
            <Stat label="First-time right" value={p.ftrPct === null ? "—" : `${p.ftrPct}%`} />
            <Stat label="Median time" value={minutes(p.medianSeconds)} />
          </div>
          {p.current && (
            <ButtonLink href={`/sessions/${p.current.id}`} className="min-h-[56px] text-[15px] shadow-none">
              Watch: {p.current.part}, step {p.current.step} of 12
            </ButtonLink>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function TeamPage() {
  return (
    <Gate area="supervisor" next="/supervisor/team">
      <SupervisorPage current="team" title="Team" sub="Each Quality Technician's last 30 days.">
        <Suspense fallback={<p className="text-[17px] text-muted">Loading…</p>}>
          <Body />
        </Suspense>
      </SupervisorPage>
    </Gate>
  );
}
