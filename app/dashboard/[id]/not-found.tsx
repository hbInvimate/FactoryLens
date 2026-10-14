import Link from "next/link";
import { Card, Page } from "@/components/dashboard/light";

export default function SessionNotFound() {
  return (
    <Page>
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-10 md:px-8">
        <Card className="flex flex-col gap-3 px-6 py-6">
          <h1 className="text-[26px] font-semibold" data-testid="session-not-found">
            Session not found
          </h1>
          <p className="text-[16px] text-[#4b5563]">
            There is no session with this link. It may have been sample data that was cleared, or the link is incomplete.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[56px] w-fit items-center rounded-lg bg-[#1f5fcf] px-5 text-[16px] font-semibold text-white hover:brightness-110"
          >
            Back to the dashboard
          </Link>
        </Card>
      </main>
    </Page>
  );
}
