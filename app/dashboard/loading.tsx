import { Page, Skeleton } from "@/components/dashboard/light";

export default function Loading() {
  return (
    <Page>
      <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-6 py-6 md:px-8">
        <Skeleton />
      </main>
    </Page>
  );
}
