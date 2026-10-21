"use client";
// The ☰ menu: a button that slides the sidebar in as an overlay. Used on the check screen and, below 1024 px,
// on every Quality Technician page. Tapping an item, outside the menu, × or Esc closes it.
import { useEffect, useState, type ReactNode } from "react";

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function MenuDrawer({ children, footer }: { /** The nav items. */ children: ReactNode; footer?: ReactNode }) {
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
        className="tap inline-flex min-w-[56px] items-center justify-center rounded-[var(--fl-radius-md)] border border-line-strong bg-surface text-ink hover:bg-surface-2"
      >
        <IconMenu />
      </button>
      {open && (
        <>
          <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200 starting:opacity-0" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col gap-4 border-r border-line bg-surface px-4 py-5 shadow-card transition-[translate] duration-200 starting:-translate-x-full"
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
            {/* Any item closes the menu. */}
            <nav aria-label="Main" className="flex flex-col gap-1.5" onClick={(e) => (e.target as HTMLElement).closest("a,button") && setOpen(false)}>
              {children}
            </nav>
            <span className="flex-1" />
            {footer}
          </aside>
        </>
      )}
    </>
  );
}