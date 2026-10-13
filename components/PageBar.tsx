import Link from "next/link";
import { Logo, cx } from "./ui";

const NAV = [
  { href: "/", label: "Start a check", key: "start" },
  { href: "/sessions", label: "Session history", key: "sessions" },
  { href: "/dashboard", label: "Dashboard", key: "dashboard" },
] as const;

/** Top bar for pages outside a running check. */
export function PageBar({ title, current }: { title?: string; current?: (typeof NAV)[number]["key"] }) {
  return (
    <header className="flex min-h-[72px] flex-none flex-wrap items-center gap-x-8 gap-y-2 border-b border-line bg-bar px-8 py-2 print:hidden">
      <Link href="/" className="tap inline-flex items-center">
        <Logo />
      </Link>
      <span aria-hidden className="h-9 w-px bg-line2" />
      {title && <span className="text-[19px] text-soft">{title}</span>}
      <span className="flex-1" />
      <nav aria-label="Main" className="flex flex-wrap gap-2">
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            aria-current={current === n.key ? "page" : undefined}
            className={cx(
              "tap inline-flex items-center rounded-xl px-4 text-[18px]",
              current === n.key ? "bg-blue font-semibold text-white" : "text-ink2 hover:bg-panel",
            )}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
