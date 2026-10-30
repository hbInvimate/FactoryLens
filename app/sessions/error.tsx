"use client";

import { useEffect } from "react";
import { Btn, Panel } from "@/components/ui";

export default function SessionsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="page-main flex flex-1 flex-col gap-5">
      <Panel title="Could not load the history">
        <p className="text-[18px] text-ink-2">The server or the database did not answer. Checks in progress are safe on their devices.</p>
        <div>
          <Btn variant="primary" onClick={() => retry()}>
            Retry
          </Btn>
        </div>
      </Panel>
    </main>
  );
}
