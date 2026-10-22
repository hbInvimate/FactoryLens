// Server-side page guard. Nothing inside renders (and no data is read) unless the signed-in person's
// role may use this area. Nobody signed in: off to the area's sign-in page.
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ButtonLink, Card } from "@/components/ds";
import { signOut } from "@/app/auth-actions";
import { AREA_FOR, AREA_HOME, ROLE_LABEL, SIGN_IN_MODES, SIGN_IN_PATH, canUse, type Area } from "@/lib/auth/roles";

/** The account each area needs, in "Sign in as a ...". */
const NEEDS: Record<Area, string> = { check: "Quality Technician", dashboard: "Quality Engineer", supervisor: "Supervisor", session: "Quality Technician" };
const HOME_TEXT: Record<Area, string> = { check: "Go to the check app", dashboard: "Go to the dashboard", supervisor: "Go to the Supervisor pages", session: "Go to the check app" };
import { AuthNotConfigured, currentUser } from "@/lib/auth/server";
import { NotConfigured } from "@/lib/server/repo";
import { Logo } from "../ui";

/** In the dashboard the sidebar already shows the app name, so only the check app shows the logo here. */
function Centered({ children, logo = true }: { children: ReactNode; logo?: boolean }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-page px-6 py-10">
      {logo && <Logo />}
      <Card className="flex w-full max-w-[560px] flex-col gap-4 px-7 py-7">{children}</Card>
    </main>
  );
}

function GateLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh flex-1 items-center justify-center bg-page text-[18px] text-muted">
      Loading…
    </div>
  );
}

async function Check({ area, next, children }: { area: Area; next: string; children: ReactNode }) {
  let user;
  try {
    user = await currentUser();
  } catch (e) {
    if (e instanceof AuthNotConfigured || e instanceof NotConfigured) {
      return (
        <Centered logo={area === "check"}>
          <h1 className="text-[24px] font-bold">Sign-in is not set up</h1>
          <p className="text-[17px] text-ink-2">{e.message}</p>
        </Centered>
      );
    }
    throw e;
  }
  if (!user) redirect(`${SIGN_IN_PATH[area]}?next=${encodeURIComponent(next)}`);
  if (!canUse(user.role, area)) {
    // Their own pages; an admin (who may use every area) gets the other of check and dashboard.
    const other: Area = SIGN_IN_MODES.find((m) => m.role === user.role && m.area !== area)?.area ?? (area === "check" ? "dashboard" : "check");
    return (
      <Centered logo={area !== "dashboard"}>
        <h1 className="text-[26px] font-bold" data-testid="wrong-area">
          This page is for {AREA_FOR[area]}
        </h1>
        <p className="text-[17px] text-ink-2">
          You are signed in as {user.name}, {ROLE_LABEL[user.role]}. To open it, sign in with a {NEEDS[area]} account.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink variant="primary" href={SIGN_IN_PATH[area]}>
            Sign in as a {NEEDS[area]}
          </ButtonLink>
          <ButtonLink href={other === "check" ? "/" : AREA_HOME[other]}>{HOME_TEXT[other]}</ButtonLink>
        </div>
        {/* The dashboard's sidebar card has its own Sign out. */}
        {area !== "dashboard" && (
          <form action={signOut.bind(null, area)}>
            <button type="submit" className="tap text-[16px] font-semibold text-primary-ink hover:underline">
              Sign out
            </button>
          </form>
        )}
      </Centered>
    );
  }
  return children;
}

/** Wrap a whole page. `next` is where to come back to after signing in. */
export function Gate({ area, next, children }: { area: Area; next: string; children: ReactNode }) {
  return (
    <Suspense fallback={<GateLoading />}>
      <Check area={area} next={next}>
        {children}
      </Check>
    </Suspense>
  );
}
