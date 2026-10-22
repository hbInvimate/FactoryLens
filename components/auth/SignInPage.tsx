// The sign-in pages: /signin (Quality Technician), /supervisor/signin (Supervisor) and /dashboard/signin
// (Quality Engineer) are one page. The mode cards say which part of the app to sign in to; the page's own
// mode is picked first.
import { Suspense } from "react";
import { Card } from "@/components/ds";
import { safeNext, type Area } from "@/lib/auth/roles";
import { Logo, Tick } from "../ui";
import { SignInForm } from "./SignInForm";

const TICKS = ["Every check follows the SOP, step by step.", "Work is saved on the tablet as you go.", "Supervisors and Quality Engineers see each check as it happens."];

async function Form({ area, searchParams }: { area: Area; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <SignInForm area={area} next={safeNext(sp.next, area)} />;
}

export function SignInPage({ area, searchParams }: { area: Area; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-page lg:flex-row">
      <section className="flex flex-col gap-8 border-b border-primary-line bg-primary-soft px-8 py-8 lg:w-[44%] lg:justify-center lg:border-r lg:border-b-0 lg:px-14">
        <Logo />
        <div className="flex flex-col gap-3">
          <p className="text-[30px] leading-tight font-bold text-ink">First-off checks, done right the first time.</p>
          <ul className="flex flex-col gap-3" data-testid="signin-ticks">
            {TICKS.map((t) => (
              <li key={t} className="flex items-start gap-3 text-[17px] text-ink-2">
                <Tick size={24} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <Card className="flex w-full max-w-[520px] flex-col gap-5 px-7 py-7">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-bold">Sign in</h1>
            <p className="text-[16px] text-ink-2">Pick how you work, then sign in.</p>
          </div>
          <Suspense fallback={<div className="h-[520px]" aria-hidden />}>
            <Form area={area} searchParams={searchParams} />
          </Suspense>
          <p className="text-[14px] text-muted">Accounts are created by an admin. Forgot your password? Ask your admin to reset it.</p>
        </Card>
      </section>
    </main>
  );
}
