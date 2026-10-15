// FL_STORAGE=memory runs on a temporary in-process database. Say so on every page, so an empty
// dashboard or history is never mistaken for lost data in Neon.
import { connection } from "next/server";
import { Suspense } from "react";

export const TEST_MODE_TEXT = "TEST MODE: data is temporary and is not saved to Neon";

export function isTestMode(): boolean {
  return process.env.FL_STORAGE === "memory";
}

async function Banner() {
  // Read at request time: the same build can run with or without FL_STORAGE=memory.
  await connection();
  if (!isTestMode()) return null;
  return (
    <div role="status" data-testid="test-mode-banner" className="flex-none border-b-2 border-amber bg-amber px-6 py-2 text-center text-[17px] font-bold text-on-amber">
      {TEST_MODE_TEXT}
    </div>
  );
}

export function TestModeBanner() {
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  );
}
