"use client";

import { useEffect } from "react";
import { Card, Page } from "@/components/dashboard/light";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page>
      <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-6 py-6 md:px-8">
        <Card className="flex flex-col gap-3 px-5 py-5">
          <h2 className="text-[20px] font-semibold">Could not load the dashboard</h2>
          <p className="text-[15px] text-[#4b5563]">The server or the database did not answer. Nothing was changed.</p>
          <div>
            <button
              type="button"
              onClick={() => retry()}
              className="min-h-[56px] rounded-lg bg-[#1f5fcf] px-6 text-[17px] font-semibold text-white hover:brightness-110"
            >
              Retry
            </button>
          </div>
        </Card>
      </main>
    </Page>
  );
}
