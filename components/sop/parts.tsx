// Small shared pieces of the SOP management pages.
import { Chip } from "@/components/ds";
import type { RevisionStatus } from "@/lib/sop-revisions";

const STATUS: Record<RevisionStatus, { tone: "blue" | "green" | "gray"; text: string }> = {
  draft: { tone: "blue", text: "Draft" },
  active: { tone: "green", text: "Active" },
  retired: { tone: "gray", text: "Retired" },
};

export function RevisionChip({ label, status }: { label: string; status: RevisionStatus }) {
  return (
    <Chip tone={STATUS[status].tone} size="sm">
      Rev {label} · {STATUS[status].text}
    </Chip>
  );
}

export function StatusChip({ status }: { status: RevisionStatus }) {
  return (
    <Chip tone={STATUS[status].tone} size="sm">
      {STATUS[status].text}
    </Chip>
  );
}

export function SampleChip({ real, sample }: { real: number; sample: number }) {
  return (
    <span data-testid="sample-chip" className="rounded-full border border-amber-line bg-amber-soft px-4 py-1.5 text-[14px] font-bold tracking-wide text-amber-ink">
      SAMPLE DATA · {real} real, {sample} sample {real + sample === 1 ? "session" : "sessions"}
    </span>
  );
}

/** The cautions of docs/sop-management: shown wherever the numbers are used to decide. */
export function Cautions() {
  return (
    <section role="note" data-testid="sop-cautions" className="print-card flex flex-col gap-1.5 rounded-card border border-amber-line bg-amber-soft px-5 py-4 text-amber-ink">
      <h2 className="text-[17px] font-semibold">Read before you decide</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px]">
        <li>Times are button taps, not measured process times.</li>
        <li>A faster step can also mean a corner was cut.</li>
        <li>The app cannot tell whether a method gives a better part. Check part quality in the tablet quality data tool.</li>
        <li>FactoryLens AI shows the data and keeps the record. It does not recommend, decide or activate anything.</li>
      </ul>
    </section>
  );
}