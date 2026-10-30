"use client";

import { useEffect } from "react";
import { Card, Page } from "@/components/dashboard/light";
import { Button } from "@/components/ds";

/** The sessions list (or a proposal) could not load: say so, and Retry. Nothing was changed. */
export default function UpdateSopError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page>
      <main className="page-main flex flex-col gap-4">
        <Card className="flex flex-col gap-3 px-5 py-5" testId="update-sop-error">
          <h2 className="text-[20px] font-semibold">Could not load this page</h2>
          <p className="text-[15px] text-ink-2">The server or the database did not answer. Nothing was changed.</p>
          <div>
            <Button variant="primary" onClick={() => retry()}>
              Retry
            </Button>
          </div>
        </Card>
      </main>
    </Page>
  );
}
