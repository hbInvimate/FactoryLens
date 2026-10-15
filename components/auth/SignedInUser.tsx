// The signed-in person and a Sign out button. Reads the session, so it sits behind its own Suspense.
import { Suspense } from "react";
import { UserCard } from "@/components/ds";
import { signOut } from "@/app/auth-actions";
import { ROLE_LABEL, type Area } from "@/lib/auth/roles";
import { currentUser } from "@/lib/auth/server";
import { cx } from "../ui";

function SignOutButton({ area, className }: { area: Area; className?: string }) {
  return (
    <form action={signOut.bind(null, area)}>
      <button
        type="submit"
        className={cx("tap inline-flex items-center rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-3 text-[15px] font-semibold text-ink hover:bg-surface-2", className)}
      >
        Sign out
      </button>
    </form>
  );
}

async function Card({ area, compact }: { area: Area; compact?: boolean }) {
  const user = await currentUser().catch(() => null);
  if (!user) return null;
  if (compact) {
    return (
      <span className="flex items-center gap-3" data-testid="signed-in-user">
        <span className="flex flex-col text-right leading-tight">
          <span className="text-[16px] font-semibold text-ink">{user.name}</span>
          <span className="text-[13px] text-primary-ink">{ROLE_LABEL[user.role]}</span>
        </span>
        <SignOutButton area={area} />
      </span>
    );
  }
  return (
    <div data-testid="signed-in-user">
      <UserCard name={user.name} role={ROLE_LABEL[user.role]} action={<SignOutButton area={area} className="w-full justify-center" />} />
    </div>
  );
}

/** The sidebar card (dashboard) or a compact one for the check app's top bar. */
export function SignedInUser({ area, compact }: { area: Area; compact?: boolean }) {
  return (
    <Suspense fallback={null}>
      <Card area={area} compact={compact} />
    </Suspense>
  );
}
