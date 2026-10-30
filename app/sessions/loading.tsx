import { TableSkeleton } from "./shared";

export default function Loading() {
  return (
    <main className="page-main flex flex-1 flex-col gap-5">
      <TableSkeleton />
    </main>
  );
}
