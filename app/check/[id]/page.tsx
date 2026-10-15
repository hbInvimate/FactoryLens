import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { CheckApp } from "@/components/check/CheckApp";
import { PageCenter } from "@/components/ui";

export const metadata = { title: "FactoryLens AI: first-off check" };

async function Check({ params }: { params: PageProps<"/check/[id]">["params"] }) {
  const { id } = await params;
  return (
    <Gate area="check" next={`/check/${id}`}>
      <CheckApp id={id} />
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
