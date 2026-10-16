// The platform's left sidebar shell for the Quality Engineer's pages: white, 1px divider, app name on top,
// nav items, user card at the bottom. On narrow screens the sidebar sits above the page.
import { Suspense, type ReactNode } from "react";
import { SignedInUser } from "@/components/auth/SignedInUser";
import { NavLinks, SideNav } from "./SideNav";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-page lg:flex-row print:block print:min-h-0 print:bg-surface">
      <aside className="flex flex-none flex-col gap-4 border-b border-line bg-surface px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-[264px] lg:border-r lg:border-b-0 lg:py-6 print:hidden">
        <div className="flex items-center gap-2.5 px-2">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-[15px] font-bold text-on-strong">FL</span>
          <span className="text-[19px] font-bold text-ink">FactoryLens AI</span>
        </div>
        {/* The URL is read at request time; until then the same links show without an active one. */}
        <Suspense fallback={<NavLinks path="" />}>
          <SideNav />
        </Suspense>
        <span className="flex-1" />
        <SignedInUser area="dashboard" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
