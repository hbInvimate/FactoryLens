// /dashboard/sop/review/[revision] (c2): the suggested changes from a candidate's checks.
// Quality Engineer and admin only. The app proposes; the Quality Engineer accepts, edits or rejects.
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { CheckAgainCard } from "@/components/sop/CheckAgainCard";
import { MakePrimary } from "@/components/sop/MakePrimary";
import { DiscardDraftButton } from "@/components/sop/DiscardDraftButton";
import { ReviewBoard, type SuggestionView } from "@/components/sop/ReviewBoard";
import { cx } from "@/components/ui";
import { activeRevision } from "@/lib/server/sop";
import { latestCheckAgain, pendingChanges } from "@/lib/server/sopActivate";
import { reviewData } from "@/lib/server/sopReview";
import { STEPS } from "@/lib/sop";

export const metadata = { title: "FactoryLens AI: review a way of working" };

const STAGES = ["Candidate", "Suggested changes", "Check again", "Confirm and activate"];

async function Body({ params }: { params: PageProps<"/dashboard/sop/review/[revision]">["params"] }) {
  const { revision } = await params;
  await connection();
  const data = await reviewData(revision);
  if (!data) notFound();
  const { revision: rev, suggestions, clips, latest } = data;
  const [changes, check, active] = await Promise.all([
    rev.status === "draft" ? pendingChanges(rev.id) : [],
    latestCheckAgain(rev.id),
    activeRevision(),
  ]);
  const n = rev.sourceSessionIds?.length ?? 0;
  const views: SuggestionView[] = suggestions.map((s) => ({
    id: s.id, step: s.step, stepName: STEPS[s.step - 1].name, type: s.type as SuggestionView["type"], oldValue: s.oldValue, proposedValue: s.proposedValue,
    newValue: s.newValue, why: s.why, warning: s.warning, status: s.status as SuggestionView["status"], decidedBy: s.decidedBy,
  }));

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-[14px] text-muted">
          <Link href="/dashboard/sop" className="hover:underline">
            SOP management
          </Link>{" "}
          / Review a way of working
        </p>
        <h1 className="text-[30px] font-bold" data-testid="review-title">
          {rev.sourceLabel ? `Suggested changes from ${n} ${n === 1 ? "check" : "checks"} by ${rev.sourceLabel}` : `Draft revision ${rev.label}`}
        </h1>
        <p className="text-[15px] text-ink-2">
          Draft revision <b>{rev.label}</b>, copied from the Active revision. {rev.status !== "draft" && `This revision is ${rev.status}; it can no longer be changed.`}
        </p>
        <ol className="flex flex-wrap gap-2" aria-label="Stages">
          {STAGES.map((s, i) => (
            <li
              key={s}
              aria-current={i === 1 ? "step" : undefined}
              className={cx("rounded-full px-3 py-1 text-[14px] font-semibold", i === 0 && "bg-primary-soft text-primary-ink", i === 1 && "bg-primary text-on-strong", i > 1 && "text-muted")}
            >
              {i + 1} {s}
              {i === 0 && " ✓"}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2.4fr_1fr]">
        <ReviewBoard suggestions={views} stepNames={STEPS.map((s) => s.name)} clips={clips} latest={latest} />
        <div className="flex flex-col gap-4">
          {rev.status === "draft" ? (
            <CheckAgainCard revisionId={rev.id} station={latest?.station ?? null} latest={check}>
              <MakePrimary
                revisionId={rev.id}
                label={rev.label}
                activeLabel={active.label}
                changes={changes.map((c) => ({ ...c, stepName: STEPS[c.step - 1].name }))}
              />
              <DiscardDraftButton revisionId={rev.id} label={rev.label} after="/dashboard/sop" />
            </CheckAgainCard>
          ) : (
            <Card className="px-6 py-5 text-[15px] text-ink-2">
              Revision {rev.label} is {rev.status}. It can no longer be changed. <Link href="/dashboard/sop" className="font-semibold text-primary-ink underline">Back to SOP management</Link>
            </Card>
          )}          <section role="note" data-testid="sop-cautions" className="flex flex-col gap-1.5 rounded-card border border-amber-line bg-amber-soft px-5 py-4 text-amber-ink">
            <h2 className="text-[17px] font-semibold">Before you confirm</h2>
            <p className="text-[15px]">
              Times are button taps until video and hands-free steps are switched on. A faster check can also mean a corner was cut. The app cannot tell whether
              a method makes a better part. Part quality is judged in the tablet quality data tool.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

export default function ReviewPage(props: PageProps<"/dashboard/sop/review/[revision]">) {
  return (
    <Gate area="dashboard" next="/dashboard/sop">
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
