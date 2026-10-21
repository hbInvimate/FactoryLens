import Link from "next/link";
import { SignedInUser } from "./auth/SignedInUser";
import { Logo, cx } from "./ui";

const NAV = [
  { href: "/tasks", label: "Sessions", key: "tasks" },
  { href: "/", label: "Start a check", key: "start" },
  { href: "/sessions", label: "Session history", key: "sessions" },
  { href: "/dashboard", label: "Dashboard", key: "dashboard" },
] as const;

/** Slim top bar for the check app's pages outside a running check. */
export function PageBar({ title, current }: { title?: string; current?: (typeof NAV)[number]["key"] }) {
  return (
    <header className="flex min-h-[68px] flex-none flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-1.5 print:hidden">
      <Link href="/" className="tap inline-flex items-center">
        <Logo />
      </Link>
      {title && (
        <>
          <span aria-hidden className="h-7 w-px bg-line" />
          <span className="text-[18px] text-muted">{title}</span>
        </>
      )}
      <span className="flex-1" />
      <nav aria-label="Main" className="flex flex-wrap gap-2">
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            aria-current={current === n.key ? "page" : undefined}
            className={cx(
              "tap inline-flex items-center rounded-[12px] border px-4 text-[18px]",
              current === n.key ? "border-primary-line bg-primary-soft font-semibold text-primary-ink" : "border-transparent text-ink-2 hover:bg-surface-2",
            )}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <SignedInUser area="check" compact />
    </header>
  );
}
