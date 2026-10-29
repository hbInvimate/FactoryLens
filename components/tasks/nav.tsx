// The Quality Technician's sidebar items: the page sidebar (TechShell) and the menu on the check screen.
// Starting an unassigned check is a link under the Sessions list, not a sidebar item.
import { IconChecklist, IconHistory } from "@/components/ds/icons";

export const TECH_NAV = [
  { href: "/tasks", label: "Sessions", icon: <IconChecklist />, key: "tasks" },
  { href: "/sessions", label: "Past sessions", icon: <IconHistory />, key: "sessions" },
] as const;

export type TechNavKey = (typeof TECH_NAV)[number]["key"];