"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

/** "Include sample data", as on /dashboard: ?sample=1 or 0, the same default. */
export function SampleSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(on);
  return (
    <label className="tap inline-flex cursor-pointer items-center gap-3 rounded-xl border-2 border-line2 bg-panel px-4 text-[18px]" aria-busy={pending}>
      <input
        type="checkbox"
        className="size-6 accent-blue"
        checked={shown}
        onChange={(e) => {
          const next = e.target.checked;
          start(() => {
            setShown(next);
            router.push(`/sessions?sample=${next ? 1 : 0}`);
          });
        }}
      />
      Include sample data
    </label>
  );
}
