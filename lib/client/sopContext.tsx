"use client";
// The SOP revision a check runs on, for the check screens. Without a provider: lib/sop.ts (revision A).
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { CODE_REVISION, stepOf, type SopRevisionText } from "@/lib/sop-revisions";

const SopContext = createContext<SopRevisionText>(CODE_REVISION);

export function SopProvider({ revision, children }: { revision: SopRevisionText; children: ReactNode }) {
  return <SopContext value={revision}>{children}</SopContext>;
}

export function useSopRevision(): SopRevisionText {
  return useContext(SopContext);
}

/** `step(n)` for the revision of this check: lib/sop.ts names and points, the revision's text. */
export function useSopStep() {
  const rev = useContext(SopContext);
  return useCallback((n: number) => stepOf(rev, n), [rev]);
}
