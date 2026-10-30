// The sign-in pages: /signin (Quality Technician), /supervisor/signin (Supervisor) and /dashboard/signin
// (Quality Engineer) are one page. The mode cards say which part of the app to sign in to; the page's own
// mode is picked first.
import { Suspense } from "react";
import { Card } from "@/components/ds";
import { safeNext, type Area } from "@/lib/auth/roles";
import { Logo, Tick } from "../ui";
import { SignInForm } from "./SignInForm";

const STEPS = [
  { who: "Technician", what: "follows the SOP on smart glasses" },
  { who: "Supervisor", what: "watches checks live" },
  { who: "Engineer", what: "updates the SOP from the best sessions" },
];

const TICKS = ["Every check follows the SOP, step by step.", "Work is saved on the tablet as you go.", "Supervisors and Quality Engineers see each check as it happens."];

async function Form({ area, searchParams }: { area: Area; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <SignInForm area={area} next={safeNext(sp.next, area)} />;
}

export function SignInPage({ area, searchParams }: { area: Area; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-page lg:flex-row">
      <section className="flex flex-col gap-10 border-b border-primary-line bg-primary-soft px-8 py-8 lg:w-[46%] lg:justify-between lg:border-r lg:border-b-0 lg:px-14 lg:py-12">
        <Logo />
        <div className="flex flex-col gap-4">
          <p className="text-[36px] leading-[1.08] font-bold tracking-tight text-ink lg:text-[52px]">AI that guides every first-off check, step by step.</p>
          <p className="text-[20px] text-ink-2">Technicians follow the SOP, AI watches each step, and engineers improve it from the best sessions.</p>
        </div>
        <div className="flex flex-col gap-8">
          <ul className="flex flex-col gap-3" data-testid="signin-ticks">
            {TICKS.map((t) => (
              <li key={t} className="flex items-start gap-3 text-[17px] text-ink-2">
                <Tick size={24} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3" data-testid="how-it-works">
            <p className="text-[14px] font-semibold tracking-wide text-primary-ink uppercase">How it works</p>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((st, i) => (
                <li key={st.who} className="flex items-start gap-2.5 rounded-[var(--fl-radius-md)] border border-primary-line bg-surface px-3 py-3">
                  <span aria-hidden className="flex size-7 flex-none items-center justify-center rounded-full bg-primary text-[14px] font-bold text-on-strong">
                    {i + 1}
                  </span>
                  <span className="text-[14px] leading-snug text-ink-2">
                    <b className="text-ink">{st.who}</b> {st.what}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <Card className="flex w-full max-w-[560px] flex-col gap-5 px-8 py-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[36px] font-bold">Sign in</h1>
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
