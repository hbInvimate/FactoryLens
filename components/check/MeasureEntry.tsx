"use client";
// Steps 7 to 10: a value is required for every point, in order. The panel works on the current open point
// only; a recorded point can be picked to correct it (a new entry, never counted twice). Recording a value
// confirms the point. Values are recorded, never judged: no tolerance, no pass or fail.
import { useState } from "react";
import type { Action, MeasureSource } from "@/lib/check/types";
import { MEASUREMENT_UNIT } from "@/lib/config";
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
};

export function measurementPrompt(point: string): string {
  return `Measurement required. Record the value for ${point} to continue.`;
}

export function MeasureEntry({ step, points, values, edit, onEdit, prompt, onRecord }: {
  step: number;
  points: string[];
  values: Map<string, LatestValue>;
  /** A recorded point picked for a correction; null: the current open point. */
  edit: string | null;
  onEdit: (point: string | null) => void;
  /** Show "Measurement required" (someone tried a later point or Next step). */
  prompt: boolean;
  onRecord: (point: string, value: number, typed: string) => void;
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
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[15px] text-muted">{edit && recorded.includes(edit) ? "Correct the value for" : "Point"}</span>
          <select
            aria-label={`Step ${step} point to record`}
            value={chosen}
            onChange={(e) => onEdit(e.target.value === current ? null : e.target.value)}
            className="tap rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 text-[20px]"
          >
            {current && <option value={current}>{current}</option>}
            {recorded.map((p) => (
              <option key={p} value={p}>
                {p} (recorded, correct it)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[15px] text-muted">Value ({MEASUREMENT_UNIT})</span>
          <input
            aria-label={`Value for ${chosen} in ${MEASUREMENT_UNIT}`}
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && record()}
            className="tap w-36 rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 text-[20px]"
          />
        </label>
        <Btn variant="success" onClick={record}>
          Record value
        </Btn>
        <span className="text-[14px] text-muted">
          {current ? `${points.length - missing.length} of ${points.length} recorded. Next: ${current}.` : `All ${points.length} recorded.`} Recording a value confirms the point.
        </span>
      </div>
      {error && (
        <p role="alert" data-testid="measure-error" className="text-[16px] text-red-ink">
          {error}
        </p>
      )}
      {recorded.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Step ${step} recorded values`}>
          {recorded.map((p) => {
            const v = values.get(p)!;
            return (
              <li key={p} data-point={p} title={SOURCE_NOTE[v.source]} className={cx("rounded-full border px-3 py-1 text-[15px]", "border-line bg-surface-2 text-ink")}>
                <b>{p}</b> {v.value} {MEASUREMENT_UNIT}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] text-muted">Values here are a working note: typed or voice-entered, not a validated record. The tablet stays the record. The app never judges a value.</p>
    </div>
  );
}
