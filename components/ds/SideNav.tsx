"use client";
// The sidebar items. The active one follows the page: SOP management for /dashboard/sop and below.
import { usePathname } from "next/navigation";
import { NavItem } from ".";
import { IconChart, IconChecklist, IconHistory, IconPlay } from "./icons";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: <IconChart />, match: (p: string) => p === "/dashboard" || (p.startsWith("/dashboard/") && !p.startsWith("/dashboard/sop")) },
  { href: "/dashboard/sop", label: "SOP management", icon: <IconChecklist />, match: (p: string) => p === "/dashboard/sop" || p.startsWith("/dashboard/sop/") },
  { href: "/sessions", label: "Session history", icon: <IconHistory />, match: (p: string) => p.startsWith("/sessions") },
  { href: "/", label: "Start a check", icon: <IconPlay />, match: (p: string) => p === "/" },
];

/** The items for a path. With no path (before the URL is known), none is marked active. */
export function NavLinks({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1.5 max-lg:flex-row max-lg:flex-wrap">
      {NAV.map((n) => (
        <NavItem key={n.href} href={n.href} icon={n.icon} active={n.match(path)}>
          {n.label}
        </NavItem>
      ))}
    </nav>
  );
}

export function SideNav() {
  return <NavLinks path={usePathname() ?? ""} />;
}
