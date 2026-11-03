"use client";
// Starting a check, shared by every Start a check button: create the check, then open it. The pending state resets
// when the page is hidden (Next keeps visited pages mounted, so a stale "Starting…" would come back with it) and on
// any path change. If the check screen has not opened within 10 s, the button offers a link to the check instead.
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

export const START_STALL_MS = 10_000;

export function useStartCheck() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  /** The check created but not opened yet, after START_STALL_MS. */
  const [stalled, setStalled] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new path: whatever was pending belongs to the old one.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setBusy(false);
    setStalled(null);
  }
  // Hidden (navigated away, kept mounted) or unmounted: reset, so the button is ready when the page shows again.
  useLayoutEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      setBusy(false);
      setStalled(null);
    },
    [],
  );

  /** Creates the check with `create` (returns its id), then opens the check screen. */
  const start = async (create: () => string | Promise<string>) => {
    setBusy(true);
    setStalled(null);
    const id = await create();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStalled(id), START_STALL_MS);
    router.push(`/check/${id}`);
    // Sessions lists the new check (and the paused one) next time it shows.
    router.refresh();
    return id;
  };

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    setStalled(null);
  };

  return { start, busy, stalled, reset };
}
