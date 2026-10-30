import { Page, Skeleton } from "@/components/dashboard/light";

export default function Loading() {
  return (
    <Page>
      <main className="page-main flex flex-col gap-4">
        <Skeleton />
      </main>
    </Page>
  );
}
