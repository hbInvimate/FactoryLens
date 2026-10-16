"use client";
// The review screen's left side (c2): the recorded operation (placeholder) with the step strip, and the
// suggested changes with Accept, Edit and Reject. Nothing is applied until accepted.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Chip, Table, Td, Th } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { cx } from "@/components/ui";
import { mmss } from "@/lib/sop-stats";

export interface SuggestionView {
  id: string;
  step: number;
  stepName: string;
  type: "time" | "order";
  oldValue: string | null;
  proposedValue: string;
  newValue: string;
  why: string;
  warning: string | null;
  status: "proposed" | "accepted" | "edited" | "rejected";
  decidedBy: string | null;
}

/** "1–4, 6, 8, 10–12". */
function ranges(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(j > i ? `${ns[i]}–${ns[j]}` : String(ns[i]));
    i = j + 1;
  }
  return out.join(", ");
}

/** Desk-side buttons: smaller than the check app's 56 px gloved-hand targets, still 44 px. */
const SMALL = "min-h-[44px]! min-w-0! px-3! text-[14px]! shadow-none";

const STATUS_TEXT = { proposed: "Proposed", accepted: "✓ Accepted", edited: "✓ Edited", rejected: "Rejected" };

function Row({ s, selected, onSelect, onDone }: { s: SuggestionView; selected: boolean; onSelect: () => void; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(s.type === "time" ? mmss(Number(s.newValue)) : s.newValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "accept" | "edit" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sop/suggestions/${encodeURIComponent(s.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(action === "edit" ? { value } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Could not save (${res.status})`);
      setEditing(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const applied = s.status === "accepted" || s.status === "edited";
  return (
    <tr data-suggestion={s.id} data-step={s.step} data-type={s.type} data-status={s.status} onClick={onSelect} className={cx(selected && "bg-amber-soft", s.status === "rejected" && "text-muted")}>
      <Td className="font-semibold">{s.step}</Td>
      <Td className="min-w-[120px]">{s.stepName}</Td>
      <Td className="whitespace-nowrap">
        {s.type === "time" ? (
          <>
            {mmss(s.oldValue === null ? null : Number(s.oldValue))} → <b>{mmss(Number(s.newValue))}</b>
            {s.oldValue !== null && <span className="text-muted"> ({`−${mmss(Number(s.oldValue) - Number(s.newValue))}`})</span>}
          </>
        ) : (
          "— —"
        )}
      </Td>
      <Td>
        <Chip tone={s.type === "time" ? "green" : "blue"} size="sm">
          {s.type === "time" ? "Time" : "Order"}
        </Chip>
      </Td>
      <Td className="min-w-[200px] text-[14px]">
        {s.type === "order" && <p className="pb-1 text-ink">New &quot;What to do&quot;: {s.newValue}</p>}
        <p className="text-ink-2">{s.why}</p>
        {s.warning && (
          <p className="mt-1 w-fit rounded-full border border-amber-line bg-amber-soft px-2.5 py-0.5 text-[13px] font-semibold text-amber-ink" data-testid="suggestion-warning">
            {s.warning}
          </p>
        )}
        {s.status === "edited" && s.newValue !== s.proposedValue && (
          <p className="pt-1 text-[13px] text-muted">Proposed: {s.type === "time" ? mmss(Number(s.proposedValue)) : s.proposedValue}</p>
        )}
        {editing && (
          <div className="flex flex-col gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
            {s.type === "time" ? (
              <input aria-label={`New CT for step ${s.step} (mm:ss)`} value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[48px] w-32 rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 text-[17px]" />
            ) : (
              <textarea aria-label={`New "What to do" for step ${s.step}`} value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[96px] w-full rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 py-2 text-[15px]" />
            )}
            <div className="flex gap-2">
              <Button variant="primary" disabled={busy} onClick={() => act("edit")} className="min-h-[48px] text-[15px]">
                Save the edit
              </Button>
              <Button disabled={busy} onClick={() => setEditing(false)} className="min-h-[48px] text-[15px]">
                Cancel
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="pt-1 text-[13px] text-red-ink">
            {error}
          </p>
        )}
      </Td>
      <Td onClick={(e) => e.stopPropagation()} className="w-[232px] min-w-[232px] px-3">
        <div className="flex flex-col items-start gap-1.5">
          <span className={cx("text-[13px] font-semibold", applied ? "text-primary-ink" : s.status === "rejected" ? "text-red-ink" : "text-muted")} data-testid="suggestion-status">
            {STATUS_TEXT[s.status]}
            {s.decidedBy && s.status !== "proposed" ? ` by ${s.decidedBy}` : ""}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {s.status !== "accepted" && (
              <Button disabled={busy} onClick={() => act("accept")} className={SMALL}>
                Accept
              </Button>
            )}
            {!editing && (
              <Button disabled={busy} onClick={() => setEditing(true)} className={SMALL}>
                Edit
              </Button>
            )}
            {s.status !== "rejected" && (
              <Button variant="danger" disabled={busy} onClick={() => act("reject")} className={SMALL}>
                Reject
              </Button>
            )}
          </div>
        </div>
      </Td>
    </tr>
  );
}

export function ReviewBoard({ suggestions, stepNames, clips, latest }: {
  suggestions: SuggestionView[];
  stepNames: string[];
  /** Step windows of the latest check, seconds from its start. */
  clips: { step: number; startSecond: number; endSecond: number }[];
  latest: { sessionId: string; startedAt: string } | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const marked = new Set(suggestions.filter((s) => s.status !== "rejected").map((s) => s.step));
  const noChange = stepNames.map((_, i) => i + 1).filter((n) => !suggestions.some((s) => s.step === n));
  const dur = (n: number) => {
    const c = clips.find((x) => x.step === n);
    return c ? Math.max(1, c.endSecond - c.startSecond) : 1;
  };
  const firstMarked = [...marked].sort((a, b) => a - b)[0];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="flex flex-col gap-3 px-6 py-5" testId="recorded-operation">
        <div>
          <h2 className="text-[20px] font-semibold">The recorded operation</h2>
          <p className="text-[14px] text-muted">
            {latest ? (
              <>
                Latest check, <LocalTime iso={latest.startedAt} />.{firstMarked ? ` Step ${firstMarked} is marked.` : ""} Video appears here once recording is switched on.
              </>
            ) : (
              "No check to show."
            )}
          </p>
        </div>
        <div className="flex aspect-[16/5] items-center justify-center rounded-card bg-ink text-[16px] text-on-strong" data-testid="video-placeholder">
          ▶ Video placeholder: not recorded yet
        </div>
        <div className="flex gap-1" role="group" aria-label="The 12 steps, sized by their time in the latest check" data-testid="step-strip">
          {stepNames.map((name, i) => {
            const n = i + 1;
            return (
              <button
                key={n}
                type="button"
                title={`Step ${n}: ${name}`}
                aria-pressed={selected === n}
                onClick={() => setSelected(n)}
                style={{ flexGrow: dur(n), flexBasis: 0 }}
                data-marked={marked.has(n) ? "1" : "0"}
                className={cx(
                  "min-h-[44px] min-w-[28px] rounded-[6px] border text-[13px] font-semibold",
                  marked.has(n) ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface-2 text-muted",
                  selected === n && "ring-2 ring-primary",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 px-6 py-5" testId="suggested-changes">
        <div>
          <h2 className="text-[20px] font-semibold">Suggested changes</h2>
          <p className="text-[14px] text-muted">Compared with the Active SOP and the station median. Accept, edit or reject each one. Nothing is applied until you accept it.</p>
        </div>
        <Table minWidth={800} testId="suggestions-table">
          <thead>
            <tr>
              <Th>Step</Th>
              <Th>What</Th>
              <Th>CT</Th>
              <Th>Type</Th>
              <Th>Why</Th>
              <Th>
                <span className="sr-only">Decide</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <Row key={s.id} s={s} selected={selected === s.step} onSelect={() => setSelected(s.step)} onDone={() => router.refresh()} />
            ))}
            {noChange.length > 0 && (
              <tr data-testid="no-change-row">
                <Td className="font-semibold">{ranges(noChange)}</Td>
                <Td>Other steps</Td>
                <Td>— —</Td>
                <Td>
                  <Chip tone="gray" size="sm">
                    No change
                  </Chip>
                </Td>
                <Td className="text-[14px] text-ink-2">No clear difference.</Td>
                <Td />
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
