"use client";
// "Export": the data as CSV, the selected point's control chart as PDF, or both in a ZIP. The point and the number of
// readings come from the URL (the control chart keeps them there).
import { useEffect, useRef, useState } from "react";

const ITEMS = [
  { format: "csv", label: "Data (CSV)", sub: "Current filters, one row per reading" },
  { format: "pdf", label: "Control chart (PDF)", sub: "Selected point and readings, A4 landscape" },
  { format: "zip", label: "Both (ZIP)", sub: "The CSV and the PDF" },
] as const;

export function ExportMenu({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const href = (format: string) => {
    const now = new URLSearchParams(window.location.search);
    const q = new URLSearchParams(query);
    for (const k of ["point", "n"]) if (now.get(k)) q.set(k, now.get(k) as string);
    q.set("format", format);
    return `/api/measurements/export?${q}`;
  };
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="tap inline-flex items-center gap-2 rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-5 text-[16px] font-semibold hover:bg-surface-2"
        data-testid="export-menu"
      >
        Export <span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 flex w-[300px] flex-col rounded-[16px] border border-line bg-surface p-1.5 shadow-card">
          {ITEMS.map((it) => (
            <a
              key={it.format}
              role="menuitem"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = href(it.format);
                setOpen(false);
              }}
              className="flex flex-col rounded-[12px] px-3 py-2 hover:bg-primary-soft"
              data-testid={`export-${it.format}`}
            >
              <b className="text-[15px]">{it.label}</b>
              <span className="text-[13px] text-muted">{it.sub}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
