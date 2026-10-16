"use client";
// Wizard stage 2: the evidence table and "Decide the new CT". Nothing is ticked or filled in for the
// Quality Engineer: they pick the evidence, type the CT and the reason, and confirm it is their decision.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Button, Card, Chip, StateBanner, Table, Td, Th } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import type { ShiftId } from "@/lib/config";
import { deltaText, mmss, parseMmss } from "@/lib/sop-stats";

export interface EvidenceView {
  id: string;
  startedAt: number;
  shift: ShiftId;
  stepSeconds: number;
  checkSeconds: number | null;
  isSample: boolean;
  operator: string | null;
}

const AREA = "min-h-[96px] w-full rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 py-3 text-[16px] text-ink";

export function CtDecision({
  step, currentTarget, targets, draftLabel, evidence, showTechnician, decidedBy, minimum, backHref, aside,
}: {
  step: number;
  currentTarget: number | null;
  /** The 12 step targets the new CT goes into (the open draft's, or the Active revision's). */
  targets: (number | null)[];
  draftLabel: string | null;
  evidence: EvidenceView[];
  showTechnician: boolean;
  decidedBy: string;
  minimum: { sessions: number; shifts: number };
  backHref: string;
  aside?: ReactNode;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [ct, setCt] = useState("");
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [today] = useState(() => new Date().toISOString());

  const newCt = parseMmss(ct);
  const chosen = evidence.filter((e) => ticked.has(e.id));
  const shifts = new Set(chosen.map((e) => e.shift)).size;
  const met = chosen.length >= minimum.sessions && shifts >= minimum.shifts;

  const checkTarget = useMemo(() => {
    const t = targets.map((x, i) => (i === step - 1 ? newCt : x));
    const before = targets.every((x) => x !== null) ? (targets as number[]).reduce((a, b) => a + b, 0) : null;
    const after = t.every((x) => x !== null) ? (t as number[]).reduce((a, b) => a + b, 0) : null;
    return { before, after, missing: t.filter((x) => x === null).length };
  }, [targets, newCt, step]);

  const canSave = newCt !== null && reason.trim().length > 0 && confirmed && (met || override.trim().length > 0) && !busy;

  const toggle = (id: string) =>
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sop/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step, newCtSeconds: newCt, reason, confirmed, evidenceSessionIds: [...ticked], overrideReason: met ? undefined : override }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; label?: string };
      if (!res.ok) throw new Error(body.error || `Could not save (${res.status})`);
      setSaved(body.label ?? "");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <Card className="flex min-w-0 flex-col gap-3 px-6 py-5" testId="evidence">
        <div>
          <h2 className="text-[20px] font-semibold">Evidence: sessions to compare</h2>
          <p className="text-[14px] text-muted">
            Completed sessions where this step was correct on the first attempt, fastest first. Tick the ones you want to keep as evidence. Sample sessions
            cannot be used as evidence.
          </p>
        </div>
        {evidence.length === 0 ? (
          <p className="text-[15px] text-ink-2" data-testid="evidence-empty">
            No completed session in this view has step {step} correct on the first attempt.
          </p>
        ) : (
          <Table minWidth={showTechnician ? 720 : 620} testId="evidence-table">
            <thead>
              <tr>
                <Th className="w-12">
                  <span className="sr-only">Use as evidence</span>
                </Th>
                <Th>Started</Th>
                <Th>Shift</Th>
                <Th>Step {step} time</Th>
                <Th>First attempt</Th>
                <Th>Check time</Th>
                {showTechnician && <Th>Quality Technician</Th>}
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.id} data-session={e.id} data-sample={e.isSample ? "1" : "0"}>
                  <Td className="py-1">
                    <input
                      type="checkbox"
                      className="size-6 accent-primary disabled:cursor-not-allowed"
                      aria-label={`Use the session of ${new Date(e.startedAt).toLocaleString()} as evidence`}
                      checked={ticked.has(e.id)}
                      disabled={e.isSample}
                      title={e.isSample ? "Sample sessions cannot be used as evidence" : undefined}
                      onChange={() => toggle(e.id)}
                    />
                  </Td>
                  <Td>
                    <Link href={`/dashboard/${e.id}`} className="font-semibold text-primary-ink hover:underline">
                      <LocalTime iso={new Date(e.startedAt).toISOString()} />
                    </Link>
                  </Td>
                  <Td>{e.shift}</Td>
                  <Td className="font-semibold">{mmss(e.stepSeconds)}</Td>
                  <Td>Correct</Td>
                  <Td>{e.checkSeconds === null ? "—" : mmss(e.checkSeconds)}</Td>
                  {showTechnician && <Td>{e.operator}</Td>}
                  <Td>
                    {e.isSample ? (
                      <Chip tone="amber" size="sm">
                        SAMPLE
                      </Chip>
                    ) : (
                      <Chip tone="gray" size="sm">
                        Real
                      </Chip>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 px-6 py-5" testId="decide-ct">
          <div>
            <h2 className="text-[20px] font-semibold">Decide the new CT</h2>
            <p className="text-[14px] text-muted">You decide the number. The app records it and who decided.</p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] text-ink-2">New target CT for step {step} (mm:ss)</span>
            <input
              value={ct}
              onChange={(e) => setCt(e.target.value)}
              inputMode="numeric"
              placeholder="mm:ss"
              aria-invalid={ct !== "" && newCt === null}
              className="min-h-[56px] rounded-[var(--fl-radius-md)] border-2 border-primary-line bg-surface px-4 text-[22px] font-semibold text-ink focus:border-primary"
            />
          </label>
          {ct !== "" && newCt === null && <p className="text-[14px] text-red-ink">Type the time as mm:ss, for example 02:40.</p>}
          <p className="text-[15px]" data-testid="ct-effect">
            Step {step}: <b>{mmss(currentTarget)}</b> → <b>{newCt === null ? "…" : mmss(newCt)}</b>
            {newCt !== null && currentTarget !== null && ` (${deltaText(currentTarget, newCt)})`}
            <br />
            Check CT target: <b>{mmss(checkTarget.before)}</b> → <b>{checkTarget.after === null ? "not set" : mmss(checkTarget.after)}</b>
            {checkTarget.after === null && newCt !== null && ` (${checkTarget.missing} other ${checkTarget.missing === 1 ? "step has" : "steps have"} no target yet)`}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] text-ink-2">Reason (required)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} className={AREA} />
          </label>
          <p className="text-[14px] text-ink-2" data-testid="evidence-count">
            Evidence ticked: {chosen.length} {chosen.length === 1 ? "session" : "sessions"} from {shifts} {shifts === 1 ? "shift" : "shifts"}. The minimum is{" "}
            {minimum.sessions} sessions from {minimum.shifts} shifts.
          </p>
          {!met && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[15px] text-amber-ink">Below the minimum: write why you go ahead with this evidence (recorded)</span>
              <textarea value={override} onChange={(e) => setOverride(e.target.value)} maxLength={2000} className={AREA} aria-label="Override reason" />
            </label>
          )}
          <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-[16px]">
            <input type="checkbox" className="size-6 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I decided this CT. FactoryLens AI did not.
          </label>
          <p className="text-[14px] text-muted">
            Decided by {decidedBy} · <LocalTime iso={today} />
          </p>
          {draftLabel && !saved && <p className="text-[14px] text-ink-2">This goes into the open draft, revision {draftLabel}.</p>}
          {error && (
            <StateBanner tone="red" role="alert" testId="decision-error">
              {error}
            </StateBanner>
          )}
          {saved !== null && (
            <StateBanner tone="green" testId="decision-saved" title={`Saved in draft revision ${saved}`}>
              Writing the better way (stage 3) comes next. <Link href={backHref} className="font-semibold underline">Back to SOP management</Link>
            </StateBanner>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" disabled title="Stage 3 opens once the new CT is saved" aria-describedby="stage3-note">
              Continue to write the better way
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {busy ? "Saving…" : "Save draft"}
            </Button>
          </div>
          <p id="stage3-note" className="text-[13px] text-muted">
            Stage 3, writing the better way, is not built yet. Save draft keeps your decision.
          </p>
        </Card>
        {aside}
      </div>
    </div>
  );
}
