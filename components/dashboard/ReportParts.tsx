"use client";
// Small interactive pieces of the session report: the clip toggle, the print button and the print stamp.
import { PLANT_TIME_ZONE } from "@/lib/config";
import { useState } from "react";
import { useNow } from "@/lib/client/hooks";
import type { Clip } from "@/lib/dashboard/report";
import { buttonClass } from "../ds";

/** Placeholder drawing: the step's points, as the Quality Technician did them or as the reference shows them. */
function ClipDrawing({ clip, side }: { clip: Clip; side: "technician" | "reference" }) {
  const n = clip.points.length;
  const W = 440;
  const slot = (W - 60) / n;
  const r = Math.min(13, slot * 0.38);
  const ref = side === "reference";
  const doneUpTo = clip.expected ? clip.points.indexOf(clip.expected) : -1;
  const range = `${clip.points[0]} to ${clip.points[n - 1]}`;
  let status: { text: string; color: string };
  if (ref) {
    status = clip.ordered && clip.expected ? { text: `${clip.expected} closes next`, color: "var(--fl-primary-ink)" } : { text: `all ${n} ${clip.ordered ? "closed" : "checked"}`, color: "var(--fl-primary-ink)" };
  } else if (clip.wrong) {
    status = { text: `${clip.wrong} closed before ${clip.expected}`, color: "var(--fl-red-ink)" };
  } else {
    status = { text: `${clip.missing.join(", ")} not ${clip.ordered ? "closed" : "checked"}`, color: "var(--fl-amber-ink)" };
  }
  return (
    <svg viewBox={`0 0 ${W} 250`} className="block h-auto w-full rounded-lg" role="img" aria-label={`${ref ? "Reference" : "Quality Technician"}: ${status.text}`}>
      <rect width={W} height="250" fill="var(--fl-draw-bg)" />
      <rect x="20" y="70" width={W - 40} height="70" rx="8" fill="var(--fl-draw-fixture)" stroke="var(--fl-draw-fixture-line)" strokeWidth="2" />
      {clip.points.map((p, i) => {
        const cx = 30 + slot * i + slot / 2;
        let fill = "var(--fl-primary)";
        let stroke = "var(--fl-primary)";
        if (clip.ordered && clip.expected) {
          const closed = ref ? i <= doneUpTo : i < doneUpTo;
          const wrong = !ref && p === clip.wrong;
          fill = wrong ? "var(--fl-red)" : closed ? "var(--fl-primary)" : "none";
          stroke = wrong ? "var(--fl-red)" : closed ? "var(--fl-primary)" : "var(--fl-draw-part-dark)";
        } else if (!ref && clip.missing.includes(p)) {
          fill = "none";
          stroke = "var(--fl-amber)";
        }
        return clip.ordered ? (
          <rect key={p} x={cx - r} y={105 - r} width={r * 2} height={r * 2} rx="3" fill={fill} stroke={stroke} strokeWidth="3" />
        ) : (
          <circle key={p} cx={cx} cy="105" r={r} fill={fill} stroke={stroke} strokeWidth="3" />
        );
      })}
      <text x={W / 2} y="185" textAnchor="middle" fontSize="20" fill="var(--fl-text-muted)">{range}</text>
      <text x={W / 2} y="220" textAnchor="middle" fontSize="20" fill={status.color}>{status.text}</text>
    </svg>
  );
}

export function ClipToggle({ clip }: { clip: Clip }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 print:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass("secondary", "w-fit text-[16px]")}
      >
        {open ? "Hide clip" : "View clip next to reference"}
      </button>
      {open && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="clip">
          <figure className="flex flex-col gap-1">
            <ClipDrawing clip={clip} side="technician" />
            <figcaption className="text-[13px] text-ink-2">Clip placeholder: Quality Technician (drawing, not video)</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <ClipDrawing clip={clip} side="reference" />
            <figcaption className="text-[13px] text-ink-2">Clip placeholder: reference from training (drawing, not video)</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

/** Opens the browser's print dialog; "Save as PDF" there makes the PDF. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={buttonClass("primary", "text-[16px]")}
    >
      Export report (PDF)
    </button>
  );
}

/** Shown on paper only. */
export function PrintedOn() {
  const now = useNow(30_000);
  return (
    <span data-testid="printed-on">
      Printed on {now ? new Date(now).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: PLANT_TIME_ZONE }) : "…"}
    </span>
  );
}
