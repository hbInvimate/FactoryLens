// The two sign-in pages share this: /signin (Quality Technician) and /dashboard/signin (Process engineer).
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ds";
import { SIGN_IN_PATH, safeNext, type Area } from "@/lib/auth/roles";
import { Logo } from "../ui";
import { SignInForm } from "./SignInForm";

const COPY: Record<Area, { who: string; what: string; other: string; otherArea: Area }> = {
  check: { who: "Quality Technician", what: "Sign in to run first-off checks.", other: "Process engineer? Sign in to the dashboard", otherArea: "dashboard" },
  dashboard: { who: "Process engineer", what: "Sign in to the dashboard.", other: "Quality Technician? Sign in to the check app", otherArea: "check" },
};

async function Form({ area, searchParams }: { area: Area; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <SignInForm area={area} next={safeNext(sp.next, area)} />;
}

export function SignInPage({ area, searchParams }: { area: Area; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = COPY[area];
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-page px-6 py-10">
      <Logo />
      <Card className="flex w-full max-w-[480px] flex-col gap-5 px-7 py-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold">Sign in</h1>
          <p className="text-[17px] font-semibold text-primary-ink">{c.who}</p>
          <p className="text-[16px] text-ink-2">{c.what}</p>
        </div>
        <Suspense fallback={<div className="h-[260px]" aria-hidden />}>
          <Form area={area} searchParams={searchParams} />
        </Suspense>
        <p className="text-[14px] text-muted">Accounts are created by an admin. Forgot your password? Ask your admin to reset it.</p>
      </Card>
      <Link href={SIGN_IN_PATH[c.otherArea]} className="tap inline-flex items-center text-[16px] font-semibold text-primary-ink hover:underline">
        {c.other}
      </Link>
    </main>
  );
}
