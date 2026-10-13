import { TableSkeleton } from "./shared";

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-5 px-8 py-7">
      <TableSkeleton />
    </main>
  );
}
