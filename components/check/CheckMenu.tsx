"use client";
// The sidebar on the check screen: hidden while a check is in progress, opened as an overlay with the menu
// button at the top left. Going to another page goes through the check's Leave flow (see CheckApp).
import { useEffect, useState } from "react";
import { Avatar, cx } from "@/components/ds";
import { TECH_NAV } from "@/components/tasks/nav";

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CheckMenu({ operator, onNavigate }: { operator: string; /** Leaves the check (Leave flow), then opens `href`. */ onNavigate: (href: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="check-menu"
        className="tap inline-flex min-w-[56px] items-center justify-center rounded-[var(--fl-radius-md)] border border-line-strong bg-surface text-ink hover:bg-surface-2"
      >
        <IconMenu />
      </button>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cx("fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        id="check-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col gap-4 border-r border-line bg-surface px-4 py-5 shadow-card transition-[translate,visibility] duration-200",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-2">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-[15px] font-bold text-on-strong">FL</span>
          <span className="flex-1 text-[19px] font-bold text-ink">FactoryLens AI</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="tap inline-flex min-w-[56px] items-center justify-center rounded-[var(--fl-radius-md)] text-[24px] text-ink-2 hover:bg-surface-2"
          >
            ×
          </button>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1.5">
          {TECH_NAV.map((n) => (
            <button
              key={n.href}
              type="button"
              onClick={() => {
                setOpen(false);
                onNavigate(n.href);
              }}
              className="flex min-h-[56px] items-center gap-3 rounded-[12px] border border-transparent px-4 text-left text-[16px] text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <span className="flex-1" />
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-3 shadow-card">
          <Avatar name={operator} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink">{operator}</span>
            <span className="text-[13px] text-primary-ink">Quality Technician</span>
          </span>
        </div>
      </aside>
    </>
  );
}