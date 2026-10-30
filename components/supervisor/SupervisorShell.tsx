// The Supervisor's sidebar shell: same layout as the Quality Technician's (TechShell), with the Supervisor's
// pages. Below 1024 px the sidebar is behind the ☰ menu.
import type { ReactNode } from "react";
import { SignedInUser } from "@/components/auth/SignedInUser";
import { NavItem } from "@/components/ds";
import { IconChart, IconChecklist, IconHome, IconUsers } from "@/components/ds/icons";
import { MenuDrawer } from "@/components/tasks/MenuDrawer";
import { Brand } from "@/components/tasks/TechShell";

export const SUPERVISOR_NAV = [
  { href: "/supervisor", label: "Home", icon: <IconHome />, key: "home" },
  { href: "/supervisor/team", label: "Team", icon: <IconUsers />, key: "team" },
  { href: "/supervisor/analytics", label: "Analytics", icon: <IconChart />, key: "analytics" },
  { href: "/supervisor/tasks", label: "Tasks", icon: <IconChecklist />, key: "tasks" },
] as const;

export type SupervisorNavKey = (typeof SUPERVISOR_NAV)[number]["key"];

const items = (current?: SupervisorNavKey) =>
  SUPERVISOR_NAV.map((n) => (
    <NavItem key={n.href} href={n.href} icon={n.icon} active={n.key === current}>
      {n.label}
    </NavItem>
  ));

export function SupervisorShell({ current, children }: { current?: SupervisorNavKey; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-page lg:flex-row print:block print:min-h-0">
      <header className="flex flex-none items-center gap-3 border-b border-line bg-surface px-4 py-2 lg:hidden print:hidden">
        <MenuDrawer footer={<SignedInUser area="supervisor" />}>{items(current)}</MenuDrawer>
        <Brand />
      </header>
      <aside className="hidden flex-none flex-col gap-4 border-r border-line bg-surface px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[264px] print:hidden">
        <Brand />
        <nav aria-label="Main" className="flex flex-col gap-1.5">
          {items(current)}
        </nav>
        <span className="flex-1" />
        <SignedInUser area="supervisor" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** A Supervisor page: the shell, the heading and the page body. */
/** A Supervisor page: title, sub-line and optional header controls (filters, export) on the right. */
export function SupervisorPage({ current, title, sub, actions, children }: { current: SupervisorNavKey; title: string; sub: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <SupervisorShell current={current}>
      <main className="page-main flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col">
            <h1 className="text-[30px] font-bold">{title}</h1>
            <p className="text-[16px] text-muted" data-testid="page-sub">{sub}</p>
          </div>
          {actions}
        </div>
        {children}
      </main>
    </SupervisorShell>
  );
}
