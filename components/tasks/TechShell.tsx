// The Quality Technician's left sidebar shell, on every Quality Technician page outside a running check: app
// name on top, nav items, user card at the bottom. Below 1024 px the sidebar is behind the ☰ menu instead.
import Link from "next/link";
import type { ReactNode } from "react";
import { SignedInUser } from "@/components/auth/SignedInUser";
import { NavItem } from "@/components/ds";
import { MenuDrawer } from "./MenuDrawer";
import { TECH_NAV, type TechNavKey } from "./nav";

export function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span aria-hidden className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-[15px] font-bold text-on-strong">FL</span>
      <span className="text-[19px] font-bold text-ink">FactoryLens AI</span>
    </div>
  );
}

const items = (current?: TechNavKey) =>
  TECH_NAV.map((n) => (
    <NavItem key={n.href} href={n.href} icon={n.icon} active={n.key === current}>
      {n.label}
    </NavItem>
  ));

/** Opens the start card on Sessions (its Start a check starts the check). */
function StartLink() {
  return (
    <Link
      href="/tasks#start"
      className="tap inline-flex items-center justify-center gap-2 rounded-[14px] bg-primary px-4 text-[17px] font-bold text-on-strong hover:bg-primary-hover"
      data-testid="sidebar-start"
    >
      ▶ Start a check
    </Link>
  );
}

export function TechShell({ current, children }: { current?: TechNavKey; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-page lg:flex-row print:block print:min-h-0">
      <header className="flex flex-none items-center gap-3 border-b border-line bg-surface px-4 py-2 lg:hidden print:hidden">
        <MenuDrawer footer={<SignedInUser area="check" />}>
          {items(current)}
          <StartLink />
        </MenuDrawer>
        <Brand />
      </header>
      <aside className="hidden flex-none flex-col gap-4 border-r border-line bg-surface px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[264px] print:hidden">
        <Brand />
        <nav aria-label="Main" className="flex flex-col gap-1.5">
          {items(current)}
        </nav>
        <StartLink />
        <span className="flex-1" />
        <SignedInUser area="check" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}