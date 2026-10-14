"use client";
// Small interactive pieces of the session report: the clip toggle, the print button and the print stamp.
import { useState } from "react";
import { useNow } from "@/lib/client/hooks";
import type { Clip } from "@/lib/dashboard/report";

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
    status = clip.ordered && clip.expected ? { text: `${clip.expected} closes next`, color: "#3CC47A" } : { text: `all ${n} ${clip.ordered ? "closed" : "checked"}`, color: "#3CC47A" };
  } else if (clip.wrong) {
    status = { text: `${clip.wrong} closed before ${clip.expected}`, color: "#F2705F" };
  } else {
    status = { text: `${clip.missing.join(", ")} not ${clip.ordered ? "closed" : "checked"}`, color: "#E6B422" };
  }
  return (
    <svg viewBox={`0 0 ${W} 250`} className="block h-auto w-full rounded-lg" role="img" aria-label={`${ref ? "Reference" : "Quality Technician"}: ${status.text}`}>
      <rect width={W} height="250" fill="#0B1114" />
      <rect x="20" y="70" width={W - 40} height="70" rx="8" fill="#1D4A3B" stroke="#2F6C55" strokeWidth="2" />
      {clip.points.map((p, i) => {
        const cx = 30 + slot * i + slot / 2;
        let fill = "#3CC47A";
        let stroke = "#3CC47A";
        if (clip.ordered && clip.expected) {
          const closed = ref ? i <= doneUpTo : i < doneUpTo;
          const wrong = !ref && p === clip.wrong;
          fill = wrong ? "#F2705F" : closed ? "#3CC47A" : "none";
          stroke = wrong ? "#F2705F" : closed ? "#3CC47A" : "#5E7580";
        } else if (!ref && clip.missing.includes(p)) {
          fill = "none";
          stroke = "#E6B422";
        }
        return clip.ordered ? (
          <rect key={p} x={cx - r} y={105 - r} width={r * 2} height={r * 2} rx="3" fill={fill} stroke={stroke} strokeWidth="3" />
        ) : (
          <circle key={p} cx={cx} cy="105" r={r} fill={fill} stroke={stroke} strokeWidth="3" />
        );
      })}
      <text x={W / 2} y="185" textAnchor="middle" fontSize="20" fill="#C9D3DA">{range}</text>
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
        className="min-h-[56px] w-fit rounded-lg border border-[#cfd5dc] bg-[#f6f7f9] px-4 text-[16px] font-semibold hover:bg-[#eceff3]"
      >
        {open ? "Hide clip" : "View clip next to reference"}
      </button>
      {open && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="clip">
          <figure className="flex flex-col gap-1">
            <ClipDrawing clip={clip} side="technician" />
            <figcaption className="text-[13px] text-[#4b5563]">Clip placeholder: Quality Technician (drawing, not video)</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <ClipDrawing clip={clip} side="reference" />
            <figcaption className="text-[13px] text-[#4b5563]">Clip placeholder: reference from training (drawing, not video)</figcaption>
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
      className="min-h-[56px] rounded-lg bg-[#1f5fcf] px-5 text-[16px] font-semibold text-white hover:brightness-110"
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
      Printed on {now ? new Date(now).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "…"}
    </span>
  );
}
