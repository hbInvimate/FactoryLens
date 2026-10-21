// The Quality Technician's sidebar items: the page sidebar (TechShell) and the menu on the check screen.
import { IconChecklist, IconHistory, IconPlay } from "@/components/ds/icons";

export const TECH_NAV = [
  { href: "/tasks", label: "Sessions", icon: <IconChecklist />, key: "tasks" },
  { href: "/", label: "Start a check", icon: <IconPlay />, key: "start" },
  { href: "/sessions", label: "Past sessions", icon: <IconHistory />, key: "sessions" },
] as const;

export type TechNavKey = (typeof TECH_NAV)[number]["key"];