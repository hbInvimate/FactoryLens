"use client";
// The sidebar on the check screen: hidden while a check is in progress, opened with the ☰ button at the top
// left. Going to another page goes through the check's Leave flow (see CheckApp).
import { Avatar } from "@/components/ds";
import { MenuDrawer } from "@/components/tasks/MenuDrawer";
import { TECH_NAV } from "@/components/tasks/nav";

export function CheckMenu({ operator, onNavigate }: { operator: string; /** Leaves the check (Leave flow), then opens `href`. */ onNavigate: (href: string) => void }) {
  return (
    <MenuDrawer
      footer={
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-3 shadow-card">
          <Avatar name={operator} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink">{operator}</span>
            <span className="text-[13px] text-primary-ink">Quality Technician</span>
          </span>
        </div>
      }
    >
      {TECH_NAV.map((n) => (
        <button
          key={n.href}
          type="button"
          onClick={() => onNavigate(n.href)}
          className="flex min-h-[56px] items-center gap-3 rounded-[12px] border border-transparent px-4 text-left text-[16px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          {n.icon}
          {n.label}
        </button>
      ))}
    </MenuDrawer>
  );
}