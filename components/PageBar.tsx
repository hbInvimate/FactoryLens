import Link from "next/link";
import { Logo } from "./ui";

/** Top bar for pages outside a running check. */
export function PageBar({ title }: { title?: string }) {
  return (
    <header className="flex min-h-[72px] flex-none items-center gap-8 border-b border-line bg-bar px-8">
      <Link href="/" className="tap inline-flex items-center">
        <Logo />
      </Link>
      <span aria-hidden className="h-9 w-px bg-line2" />
      {title && <span className="text-[19px] text-soft">{title}</span>}
      <span className="flex-1" />
      <nav className="flex gap-3">
        <Link href="/" className="tap inline-flex items-center rounded-xl px-4 text-[18px] text-ink2 hover:bg-panel">
          Start a check
        </Link>
        <Link href="/sessions" className="tap inline-flex items-center rounded-xl px-4 text-[18px] text-ink2 hover:bg-panel">
          Session history
        </Link>
      </nav>
    </header>
  );
}
