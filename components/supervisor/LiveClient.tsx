"use client";
// Client pieces of the Supervisor's live view: the 5-second refresh while the check runs, and the placeholder buttons.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ds";

/** Reloads the page's data every `seconds` while `on` (the check has not ended). */
export function AutoRefresh({ on, seconds = 5 }: { on: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);
  return null;
}

/** A button for a feature that is not built yet: a tap says so. */
export function ComingSoon({ children, testId }: { children: string; testId?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative inline-flex">
      <Button className="min-h-[56px] px-5 text-[15px]" onClick={() => setShown(true)} data-testid={testId}>
        {children}
      </Button>
      <span role="status" className="absolute top-full right-0 mt-1 whitespace-nowrap text-[13px] text-muted">
        {shown ? "Coming soon" : ""}
      </span>
    </span>
  );
}
