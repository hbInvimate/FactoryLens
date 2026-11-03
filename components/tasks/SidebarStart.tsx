"use client";
// The sidebar's Start a check. On Sessions it starts the check through the start card (one start function, the
// card's Part and Cell); elsewhere it opens Sessions at the start card.
import Link from "next/link";

export function SidebarStart() {
  return (
    <Link
      href="/tasks#start"
      onClick={(e) => {
        const hero = document.querySelector<HTMLButtonElement>('[data-testid="start-a-check"]');
        if (hero && hero.offsetParent !== null && !hero.disabled) {
          e.preventDefault();
          hero.click();
        }
      }}
      className="tap inline-flex items-center justify-center gap-2 rounded-[14px] bg-primary px-4 text-[17px] font-bold text-on-strong hover:bg-primary-hover"
      data-testid="sidebar-start"
    >
      ▶ Start a check
    </Link>
  );
}
