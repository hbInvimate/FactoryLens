"use client";
// Steps 7 to 10: a value is required for every point, in order. The panel works on the current open point
// only; a recorded point can be picked to correct it (a new entry, never counted twice). Recording a value
// confirms the point. Values are recorded, never judged: no tolerance, no pass or fail.
import { useState } from "react";
import type { Action, MeasureSource } from "@/lib/check/types";
import { DEMO_FILL_ENABLED, DEMO_FILL_NOMINALS, DEMO_FILL_SPREAD, MEASUREMENT_UNIT } from "@/lib/config";
import { Bars, Btn, Speaker, cx } from "../ui";

export const MEASURED_STEPS = [7, 8, 9, 10];

export interface LatestValue {
  value: number | null;
  source: MeasureSource;
  status: string;
}

/** The latest value per point of a step, from the session's actions. */
export function latestValues(actions: Action[], step: number): Map<string, LatestValue> {
  const out = new Map<string, LatestValue>();
  for (const a of [...actions].sort((x, y) => x.seq - y.seq)) {
    if (a.type === "measure" && a.step === step) out.set(a.point, { value: a.value, source: a.source, status: a.status });
  }
  return out;
}

export const hasValue = (v: LatestValue | undefined) => !!v && v.status === "recorded" && v.value !== null;

/** The points of a step still without a value, in SOP order. */
export function missingValues(points: string[], values: Map<string, LatestValue>): string[] {
  return points.filter((p) => !hasValue(values.get(p)));
}

/** "12,4", "12.4", "-0.5" to a number; null if it is not one. */
export function parseTyped(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!/^[-+]?\d{1,5}(\.\d{1,4})?$/.test(t)) return null;
  return Number(t);
}

export const SOURCE_NOTE: Record<MeasureSource, string> = {
  voice: "Voice-entered, not a validated record",
  typed: "Typed, not a validated record",
  demo: "Demo only. Values are invented.",
};

/** An invented value near the feature's nominal (lib/config.ts). For demos only; never a measurement. */
export function demoValue(point: string): number {
  const nominal = DEMO_FILL_NOMINALS[point[0] as keyof typeof DEMO_FILL_NOMINALS] ?? 1;
  return Math.round((nominal + (Math.random() * 2 - 1) * DEMO_FILL_SPREAD) * 100) / 100;
}

export function measurementPrompt(point: string): string {
  return `Measurement required. Record the value for ${point} to continue.`;
}

export function MeasureEntry({ step, points, values, edit, onEdit, prompt, onRecord, onFillDemo }: {
  step: number;
  points: string[];
  values: Map<string, LatestValue>;
  /** A recorded point picked for a correction; null: the current open point. */
  edit: string | null;
  onEdit: (point: string | null) => void;
  /** Show "Measurement required" (someone tried a later point or Next step). */
  prompt: boolean;
  onRecord: (point: string, value: number, typed: string) => void;
  /** "Fill demo values": every open point, in order. Absent when demo fill is off. */
  onFillDemo?: (points: string[]) => void;
}) {
  const missing = missingValues(points, values);
  const current = missing[0] ?? null;
  const recorded = points.filter((p) => hasValue(values.get(p)));
  const chosen = edit && recorded.includes(edit) ? edit : current ?? recorded[0];
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const record = () => {
    const n = parseTyped(text);
    if (n === null) {
      setError("Enter a number, for example 12.4.");
      return;
    }
    onRecord(chosen, n, text.trim());
    setText("");
    setError(null);
    onEdit(null); // back to the next open point
  };

  return (
    <div className="flex flex-col gap-2 rounded-[var(--fl-radius-md)] border border-line bg-surface px-4 py-3" data-testid="measure-entry">
      {prompt && current && (
        <div role="alert" data-testid="measure-prompt" className="flex items-center gap-3 rounded-[var(--fl-radius-md)] border-2 border-amber bg-amber-soft px-4 py-2 text-[18px] font-semibold text-amber-ink">
          <Speaker size={30} />
          <Bars live={false} />
          <span>{measurementPrompt(current)}</span>
        </div>
      )}
      {/* A fixed layout, the same on every measure step, so nothing moves with point names or screen width.
          Row 1: Point (110 px) · Value (110 px) · Record value, all 48 px tall on one line. */}
      <div className="grid grid-cols-[110px_110px_auto] items-end justify-start gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[15px] text-muted">{edit && recorded.includes(edit) ? "Correct the value for" : "Point"}</span>
          <select
            aria-label={`Step ${step} point to record`}
            value={chosen}
            onChange={(e) => onEdit(e.target.value === current ? null : e.target.value)}
            className="h-12 min-h-[48px]! rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 text-[18px] w-[110px] min-w-0! truncate"
          >
            {current && <option value={current}>{current}</option>}
            {recorded.map((p) => (
              <option key={p} value={p}>
                {p} (recorded, correct it)
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[15px] text-muted">Value ({MEASUREMENT_UNIT})</span>
          <input
            aria-label={`Value for ${chosen} in ${MEASUREMENT_UNIT}`}
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && record()}
            className="h-12 min-h-[48px]! rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 text-[18px] w-[110px]"
          />
        </label>
        <Btn variant="success" onClick={record} className="h-12 min-h-[48px]! whitespace-nowrap">
          Record value
        </Btn>
      </div>
      {error && (
        <p role="alert" data-testid="measure-error" className="text-[16px] text-red-ink">
          {error}
        </p>
      )}
      {/* Row 2: Fill demo values, with its note on the same line. */}
      {DEMO_FILL_ENABLED && onFillDemo && (
        <div className="flex flex-nowrap items-center gap-3">
          <Btn
            variant="amber"
            disabled={missing.length === 0}
            className="h-12 min-h-[48px]! flex-none whitespace-nowrap"
            onClick={() => {
              onFillDemo(missing);
              setText("");
              setError(null);
              onEdit(null);
            }}
          >
            Fill demo values
          </Btn>
          <span className="text-[13px] whitespace-nowrap text-amber-ink">Demo only. Values are invented.</span>
        </div>
      )}
      {/* Row 3: progress. */}
      <p className="text-[14px] text-muted" data-testid="measure-progress">
        {current ? `${points.length - missing.length} of ${points.length} recorded. Next: ${current}.` : `All ${points.length} recorded.`} Recording a value confirms the point.
      </p>
      {/* Row 4: the recorded values, then the working note. */}
      {recorded.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Step ${step} recorded values`}>
          {recorded.map((p) => {
            const v = values.get(p)!;
            return (
              <li key={p} data-point={p} title={SOURCE_NOTE[v.source]} className={cx("rounded-full border px-3 py-1 text-[15px]", "border-line bg-surface-2 text-ink")}>
                <b>{p}</b> {v.value} {MEASUREMENT_UNIT}
                {v.source === "demo" && <span className="ml-1.5 rounded-full bg-amber-soft px-1.5 text-[11px] font-bold text-amber-ink">DEMO</span>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] text-muted">Values here are a working note: typed or voice-entered, not a validated record. The tablet stays the record. The app never judges a value.</p>
    </div>
  );
}
