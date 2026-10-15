import { Panel } from "@/components/ui";

export function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-card bg-surface" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function NotConfiguredNotice() {
  return (
    <Panel title="The database is not set up">
      <p className="text-[18px] text-ink-2">
        DATABASE_URL is not set on the server, so the history cannot be read. Checks keep working on this device and are saved
        once the database is connected. See the README: Set up the database.
      </p>
    </Panel>
  );
}
