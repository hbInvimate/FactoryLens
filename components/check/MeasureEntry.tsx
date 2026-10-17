"use client";
// Steps 7 to 10: type the value for a check point. Recording it also confirms the point (no double entry).
// Values are recorded, never judged: no tolerance, no pass or fail. A correction is a new entry.
import { useState } from "react";
import type { Action, MeasureSource } from "@/lib/check/types";
import { MEASUREMENT_UNIT } from "@/lib/config";
import { Btn, cx } from "../ui";

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

export function MeasureEntry({ step, points, confirmed, values, onRecord }: {
  step: number;
  points: string[];
  confirmed: Set<string>;
  values: Map<string, LatestValue>;
  onRecord: (point: string, value: number, typed: string) => void;
}) {
  const next = points.find((p) => !confirmed.has(p) && !values.has(p)) ?? points.find((p) => !values.has(p)) ?? points[0];
  const [point, setPoint] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosen = point && points.includes(point) ? point : next;
  const record = () => {
    const n = parseTyped(text);
    if (n === null) {
      setError(`Type a number for ${chosen}, for example 12.4`);
      return;
    }
    onRecord(chosen, n, text.trim());
    setText("");
    setError(null);
    setPoint(null); // on to the next point
  };
  return (
    <div className="flex flex-col gap-2 rounded-[var(--fl-radius-md)] border border-line bg-surface px-4 py-3" data-testid="measure-entry">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[15px] text-muted">Point</span>
          <select
            aria-label={`Step ${step} point to record`}
            value={chosen}
            onChange={(e) => setPoint(e.target.value)}
            className="tap rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 text-[20px]"
          >
            {points.map((p) => (
              <option key={p} value={p}>
                {p}
                {values.has(p) ? " (recorded)" : ""}
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
        <span className="text-[14px] text-muted">Recording a value also confirms the point.</span>
      </div>
      {error && (
        <p role="alert" className="text-[16px] text-red-ink">
          {error}
        </p>
      )}
      {values.size > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Step ${step} recorded values`}>
          {points
            .filter((p) => values.has(p))
            .map((p) => {
              const v = values.get(p)!;
              return (
                <li key={p} data-point={p} title={SOURCE_NOTE[v.source]} className={cx("rounded-full border px-3 py-1 text-[15px]", v.status === "recorded" ? "border-line bg-surface-2 text-ink" : "border-amber-line bg-amber-soft text-amber-ink")}>
                  <b>{p}</b> {v.value === null ? v.status : `${v.value} ${MEASUREMENT_UNIT}`}
                </li>
              );
            })}
        </ul>
      )}
      <p className="text-[13px] text-muted">Values here are a working note: typed or voice-entered, not a validated record. The tablet stays the record. The app never judges a value.</p>
    </div>
  );
}
