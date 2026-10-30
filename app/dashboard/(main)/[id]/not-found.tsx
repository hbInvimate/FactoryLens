import { Card, Page } from "@/components/dashboard/light";
import { ButtonLink } from "@/components/ds";

export default function SessionNotFound() {
  return (
    <Page>
      <main className="page-main flex flex-col gap-4">
        <Card className="flex flex-col gap-3 px-6 py-6">
          <h1 className="text-[26px] font-semibold" data-testid="session-not-found">
            Session not found
          </h1>
          <p className="text-[16px] text-ink-2">
            There is no session with this link. It may have been sample data that was cleared, or the link is incomplete.
          </p>
          <ButtonLink variant="primary" href="/dashboard" className="w-fit">
            Back to the dashboard
          </ButtonLink>
        </Card>
      </main>
    </Page>
  );
}
