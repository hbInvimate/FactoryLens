import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { CheckApp } from "@/components/check/CheckApp";
import { PageCenter } from "@/components/ui";
import { runnableRevisions } from "@/lib/server/sop";

export const metadata = { title: "FactoryLens AI: first-off check" };

/** Inside the Gate: every revision a check may run on, so this check uses the one it started with (or revision A). */
async function WithRevisions({ id }: { id: string }) {
  return <CheckApp id={id} revisions={await runnableRevisions()} />;
}

async function Check({ params }: { params: PageProps<"/check/[id]">["params"] }) {
  const { id } = await params;
  return (
    <Gate area="check" next={`/check/${id}`}>
      <WithRevisions id={id} />
    </Gate>
  );
}

export default function CheckPage(props: PageProps<"/check/[id]">) {
  return (
    <Suspense fallback={<PageCenter title="Loading the check…" />}>
      <Check params={props.params} />
    </Suspense>
  );
}
