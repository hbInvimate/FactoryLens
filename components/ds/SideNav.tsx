"use client";
// The sidebar items. The active one follows the page: SOP management for /dashboard/sop and below.
import { usePathname } from "next/navigation";
import { NavItem } from ".";
import { IconChart, IconHistory, IconPlay, IconTarget } from "./icons";

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/** The Quality Engineer's pages. The check app's pages are not here: they are for Quality Technicians. */
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: <IconChart />, match: (p: string) => under(p, "/dashboard") && !["/dashboard/sop", "/dashboard/update-sop", "/dashboard/measurements"].some((b) => under(p, b)) },
  { href: "/dashboard/update-sop", label: "Update SOP", icon: <IconPlay />, match: (p: string) => under(p, "/dashboard/update-sop") },
  { href: "/dashboard/sop", label: "SOP history", icon: <IconHistory />, match: (p: string) => under(p, "/dashboard/sop") },
  { href: "/dashboard/measurements", label: "Measurements", icon: <IconTarget />, match: (p: string) => under(p, "/dashboard/measurements") },
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
