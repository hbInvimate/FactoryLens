// /dashboard/update-sop/[revision]: "Check what the platform found" (not changed yet), then, after Confirm,
// "SOP updated to rev B". Quality Engineer and admin only.
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { ButtonLink, Chip } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { RollbackButton } from "@/components/sop/RollbackButton";
import { RecordedOperation } from "@/components/sop/StepStrip";
import { VerifyActions } from "@/components/sop/VerifyActions";
import { activeRevision } from "@/lib/server/sop";
import { revisionTargets } from "@/lib/server/sopData";
import { reviewData } from "@/lib/server/sopReview";
import { replacedBy } from "@/lib/server/sopUpdate";
import { STEPS } from "@/lib/sop";
import { deltaText, mmss } from "@/lib/sop-stats";

export const metadata = { title: "FactoryLens AI: Update SOP" };

type Suggestion = NonNullable<Awaited<ReturnType<typeof reviewData>>>["suggestions"][number];

interface StepChange {
  step: number;
  oldCt: number | null;
  newCt: number | null;
  /** This check's time for the step, and the station median it was compared with. */
  took: number | null;
  median: number | null;
  warning: string | null;
  note: string | null;
}

/** Seconds saved on the target; 0 for an order note alone. */
const gain = (c: StepChange) => (c.oldCt !== null && c.newCt !== null ? c.oldCt - c.newCt : 0);

/** What would change, one entry per step, the biggest time gain first. */
function byStep(suggestions: Suggestion[]): StepChange[] {
  const steps = [...new Set(suggestions.map((s) => s.step))];
  return steps
    .map((n) => {
      const time = suggestions.find((s) => s.step === n && s.type === "time");
      const order = suggestions.find((s) => s.step === n && s.type === "order");
      const d = (time?.detail ?? {}) as { candidateMedianSeconds?: number; referenceSeconds?: number };
      return {
        step: n,
        oldCt: time?.oldValue != null ? Number(time.oldValue) : null,
        newCt: time ? Number(time.newValue) : null,
        took: d.candidateMedianSeconds ?? null,
        median: d.referenceSeconds ?? null,
        warning: time?.warning ?? null,
        note: order ? order.newValue.slice((order.oldValue ?? "").length).trim() : null,
      };
    })
    .sort((a, b) => gain(b) - gain(a) || a.step - b.step);
}

const pointNoun = (n: number) => (STEPS[n - 1].pointSet.split(" ")[0] || "points").toLowerCase();

function ChangeCard({ c }: { c: StepChange }) {
  const kind = c.newCt !== null && c.note ? "Time + order" : c.newCt !== null ? "Time" : "Order";
  return (
    <li data-step={c.step} className="flex flex-col gap-1.5 rounded-card border border-line bg-surface px-5 py-4">
      <span className="flex flex-wrap items-center gap-3">
        <b className="text-[18px]">
          Step {c.step}: {STEPS[c.step - 1].name}
        </b>
        <Chip tone={c.note ? "blue" : "green"} size="sm">
          {kind}
        </Chip>
      </span>
      {c.newCt !== null && (
        <span className="text-[16px]" data-testid="change-ct">
          <span className="text-muted">Target</span> <b>{mmss(c.oldCt)}</b> → <b className="text-primary-ink">{mmss(c.newCt)}</b>
          {c.oldCt !== null && <span className="text-muted"> ({deltaText(c.oldCt, c.newCt)})</span>}
        </span>
      )}
      <span className="text-[15px] text-ink-2">
        {c.took !== null && c.median !== null && `In this session it took ${mmss(Math.round(c.took))}. The station median is ${mmss(c.median)}. `}
        {c.note && (
          <span data-testid="change-order">
            The {pointNoun(c.step)} were checked in another order. New note for &quot;What to do&quot;: {c.note}
          </span>
        )}
        {!c.note && STEPS[c.step - 1].ordered && `The order ${STEPS[c.step - 1].pointSet.replace("Clamps ", "")} stays the same.`}
      </span>
      {c.warning && <span className="w-fit rounded-full border border-amber-line bg-amber-soft px-2.5 py-0.5 text-[13px] font-semibold text-amber-ink">{c.warning}</span>}
    </li>
  );
}

const sum = (xs: (number | null)[]) => (xs.length === 12 && xs.every((x) => x !== null) ? (xs as number[]).reduce((a, b) => a + b, 0) : null);

async function Body({ params }: { params: PageProps<"/dashboard/update-sop/[revision]">["params"] }) {
  const { revision } = await params;
  await connection();
  const data = await reviewData(revision);
  if (!data) notFound();
  const { revision: rev, suggestions, clips, latest } = data;
  const changes = byStep(suggestions);
  const session = latest ? (
    <>
      the session of <LocalTime iso={latest.startedAt} /> by {rev.sourceLabel}
    </>
  ) : (
    <>a session by {rev.sourceLabel}</>
  );

  if (rev.status === "discarded") {
    return (
      <Card className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 px-8 py-8 text-center" testId="update-discarded">
        <h1 className="text-[26px] font-bold">Discarded. Nothing was changed.</h1>
        <p className="text-[16px] text-ink-2">The SOP is the same as before. The proposal is kept in SOP history as revision {rev.label}, discarded.</p>
        <ButtonLink href="/dashboard/update-sop">Back to Update SOP</ButtonLink>
      </Card>
    );
  }

  if (rev.status !== "draft" && rev.status !== "confirming") {
    const prev = await replacedBy(rev.id);
    const [before, after] = await Promise.all([prev ? revisionTargets(prev.id) : Promise.resolve([] as (number | null)[]), revisionTargets(rev.id)]);
    const oldCheck = sum(before);
    const newCheck = sum(after);
    return (
      <Card className="mx-auto mt-6 flex w-full max-w-[760px] flex-col items-center gap-4 px-10 py-10 text-center" testId="update-done">
        <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-[30px] font-bold text-primary-ink">
          ✔
        </span>
        <h1 className="text-[28px] font-bold">SOP updated to rev {rev.label}</h1>
        {rev.activatedAt && (
          <p className="-mt-2 text-[16px] text-muted">
            Confirmed by {rev.activatedBy} · <LocalTime iso={rev.activatedAt.toISOString()} />
          </p>
        )}
        <div className="flex w-full flex-col gap-1.5 rounded-card bg-surface-2 px-5 py-4 text-left text-[16px]" data-testid="what-changed">
          <b>What changed</b>
          {changes.map((c) => (
            <span key={c.step}>
              Step {c.step}: {c.newCt !== null ? `target ${mmss(c.oldCt)} → ${mmss(c.newCt)}` : "no new target"}
              {c.note ? `, new note on the order of the ${pointNoun(c.step)}` : ""}
            </span>
          ))}
          {oldCheck !== null && newCheck !== null && (
            <span>
              <b>Check target:</b> {mmss(oldCheck)} → {mmss(newCheck)}
            </span>
          )}
        </div>
        <p className="text-[15px] text-ink-2">
          New checks use rev {rev.label}. Checks that are running finish on the revision they started with. Quality Technicians see a note on their start page.
          {rev.status === "retired" && " Since then another revision has been made active."}
        </p>
        <div className="flex flex-wrap items-start justify-center gap-3">
          {prev && rev.status === "active" && <RollbackButton revisionId={prev.id} label={prev.label} cta={`Go back to rev ${prev.label}`} />}
          <ButtonLink variant="primary" href="/dashboard">
            Done
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const active = await activeRevision();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-[14px] text-muted">
          <Link href="/dashboard/update-sop" className="hover:underline">
            Update SOP
          </Link>{" "}
          / Check the result
        </p>
        <h1 className="text-[30px] font-bold">Check what the platform found</h1>
      </div>
      <p role="status" data-testid="not-changed-yet" className="rounded-card border border-amber-line bg-amber-soft px-5 py-3 text-[16px] text-amber-ink">
        <b>Not changed yet.</b> The SOP stays on rev {active.label} until you confirm.
      </p>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="flex flex-col gap-3 px-6 py-5">
          <div>
            <h2 className="text-[20px] font-semibold">What would change</h2>
            <p className="text-[14px] text-muted">From {session}. All other steps: no clear difference.</p>
          </div>
          <ul className="flex flex-col gap-3" data-testid="update-changes">
            {changes.map((c) => (
              <ChangeCard key={c.step} c={c} />
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 px-6 py-5" testId="recorded-operation">
            <div>
              <h2 className="text-[20px] font-semibold">The session</h2>
              <p className="text-[14px] text-muted">Steps that would change are marked.</p>
            </div>
            <RecordedOperation stepNames={STEPS.map((s) => s.name)} clips={clips} marked={changes.map((c) => c.step)} />
          </Card>
          <Card className="flex flex-col gap-3 px-6 py-5">
            <p className="text-[14px] text-ink-2">
              Applies to new checks only. A check that is running finishes on rev {active.label}. Times are button taps until video and hands-free are on. Part
              quality is judged in the tablet quality data tool.
            </p>
            <VerifyActions
              revisionId={rev.id}
              afterDiscard={latest?.station ? `/dashboard/update-sop?station=${encodeURIComponent(latest.station)}` : "/dashboard/update-sop"}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage(props: PageProps<"/dashboard/update-sop/[revision]">) {
  return (
    <Gate area="dashboard" next="/dashboard/update-sop">
      <Page>
        <main className="page-main flex flex-col gap-4">
          <Suspense fallback={<Skeleton />}>
            <Body params={props.params} />
          </Suspense>
        </main>
      </Page>
    </Gate>
  );
}
