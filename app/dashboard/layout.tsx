import type { ReactNode } from "react";
import { DashboardShell } from "@/components/ds/DashboardShell";

/** Every /dashboard page, its loading state and its error state sit in the sidebar shell. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell current="dashboard">{children}</DashboardShell>;
}
