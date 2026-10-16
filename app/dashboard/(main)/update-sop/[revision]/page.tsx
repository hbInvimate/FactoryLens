// /dashboard/update-sop/[revision]: verify the proposal (not changed yet), then the result after Confirm.
// Quality Engineer and admin only.
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { ButtonLink } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { RollbackButton } from "@/components/sop/RollbackButton";
import { RecordedOperation } from "@/components/sop/StepStrip";
import { VerifyActions } from "@/components/sop/VerifyActions";
import { reviewData } from "@/lib/server/sopReview";
import { replacedBy } from "@/lib/server/sopUpdate";
import { STEPS } from "@/lib/sop";
import { mmss } from "@/lib/sop-stats";

export const metadata = { title: "FactoryLens AI: Update SOP" };

type Suggestion = NonNullable<Awaited<ReturnType<typeof reviewData>>>["suggestions"][number];

/** One line per step: old to new target, a short why, the order note when there is one. */
function Changes({ suggestions }: { suggestions: Suggestion[] }) {
  const steps = [...new Set(suggestions.map((s) => s.step))].sort((a, b) => a - b);
  return (
    <ul className="flex flex-col gap-2" data-testid="update-changes">
      {steps.map((n) => {
        const time = suggestions.find((s) => s.step === n && s.type === "time");
        const order = suggestions.find((s) => s.step === n && s.type === "order");
        const note = order ? order.newValue.slice((order.oldValue ?? "").length).trim() : null;
        return (
          <li key={n} data-step={n} className="rounded-[var(--fl-radius-md)] border border-line bg-surface-2 px-4 py-3 text-[16px]">
            <b>
              Step {n}: {STEPS[n - 1].name}
            </b>
            {time && (
              <span className="block" data-testid="change-ct">
                Target {mmss(time.oldValue === null ? null : Number(time.oldValue))} → <b>{mmss(Number(time.newValue))}</b>
                <span className="block text-[14px] text-ink-2">{time.why}</span>
                {time.warning && <span className="mt-1 block w-fit rounded-full border border-amber-line bg-amber-soft px-2.5 py-0.5 text-[13px] font-semibold text-amber-ink">{time.warning}</span>}
              </span>
            )}
            {note && (
              <span className="block pt-1 text-[15px]" data-testid="change-order">
                Order note for &quot;What to do&quot;: {note}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function Body({ params }: { params: PageProps<"/dashboard/update-sop/[revision]">["params"] }) {
  const { revision } = await params;
  await connection();
  const data = await reviewData(revision);
  if (!data) notFound();
  const { revision: rev, suggestions, clips, latest } = data;
  const marked = [...new Set(suggestions.map((s) => s.step))];
  const from = latest ? <>the check by {rev.sourceLabel} on <LocalTime iso={latest.startedAt} /></> : <>a check by {rev.sourceLabel}</>;

  if (rev.status === "discarded") {
    return (
      <Card className="flex flex-col gap-3 px-6 py-5" testId="update-discarded">
        <h1 className="text-[26px] font-bold">Discarded. Nothing was changed.</h1>
        <p className="text-[16px] text-ink-2">The SOP is the same as before. The proposal is kept in SOP history as revision {rev.label}, discarded.</p>
        <ButtonLink href="/dashboard/update-sop" className="w-fit">
          Back to Update SOP
        </ButtonLink>
      </Card>
    );
  }

  if (rev.status !== "draft" && rev.status !== "confirming") {
    const prev = await replacedBy(rev.id);
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 px-6 py-5" testId="update-done">
          <h1 className="text-[28px] font-bold">The SOP is now rev {rev.label}</h1>
          <p className="text-[17px] text-ink-2">
            It changed only now, when you confirmed{rev.activatedAt ? <> (<LocalTime iso={rev.activatedAt.toISOString()} />, by {rev.activatedBy})</> : null}. New checks use rev {rev.label}. Checks that
            are running keep the revision they started with.
            {rev.status === "retired" && " Since then another revision has been made active."}
          </p>
          <Changes suggestions={suggestions} />
          <div className="flex flex-wrap items-start gap-3">
            {prev && rev.status === "active" && <RollbackButton revisionId={prev.id} label={prev.label} cta={`Go back to rev ${prev.label}`} />}
            <ButtonLink href="/dashboard/sop">See SOP history</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-[14px] text-muted">
          <Link href="/dashboard/update-sop" className="hover:underline">
            Update SOP
          </Link>{" "}
          / Verify
        </p>
        <h1 className="text-[28px] font-bold">Update the SOP from {from}</h1>
      </div>
      <p role="status" data-testid="not-changed-yet" className="rounded-card border-2 border-amber bg-amber-soft px-5 py-3 text-[17px] text-amber-ink">
        <b>Not changed yet.</b> The SOP changes only when you press &quot;Confirm and update SOP&quot;. Discard leaves it as it is.
      </p>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card className="flex flex-col gap-3 px-6 py-5">
          <h2 className="text-[20px] font-semibold">Changes found</h2>
          <p className="text-[14px] text-muted">Compared with the active SOP and the station&apos;s other real checks. All of these are applied together, or none.</p>
          <Changes suggestions={suggestions} />
          <VerifyActions revisionId={rev.id} />
        </Card>
        <Card className="flex flex-col gap-3 px-6 py-5" testId="recorded-operation">
          <h2 className="text-[20px] font-semibold">The recorded operation</h2>
          <RecordedOperation stepNames={STEPS.map((s) => s.name)} clips={clips} marked={marked} />
          <p className="text-[13px] text-muted">Times are button taps, not measured process times. A faster check can also mean a corner was cut. Part quality is judged in the tablet quality data tool.</p>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyPage(props: PageProps<"/dashboard/update-sop/[revision]">) {
  return (
    <Gate area="dashboard" next="/dashboard/update-sop">
      <Page>
        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-6 py-6 md:px-8">
          <Suspense fallback={<Skeleton />}>
            <Body params={props.params} />
          </Suspense>
        </main>
      </Page>
    </Gate>
  );
}
