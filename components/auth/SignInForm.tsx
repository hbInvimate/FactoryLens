"use client";
import { useActionState, useState } from "react";
import { signInMode, type SignInState } from "@/app/auth-actions";
import { Button, Field, Input, StateBanner, cx } from "@/components/ds";
import { ROLE_LABEL, SIGN_IN_MODES, type Area } from "@/lib/auth/roles";

/** The 3 mode cards, email, password and "Sign in as <mode>". `area`: the page's own mode, picked first. */
export function SignInForm({ area, next }: { area: Area; next: string }) {
  const [mode, setMode] = useState<Area>(SIGN_IN_MODES.some((m) => m.area === area) ? area : "check");
  const [state, action, pending] = useActionState<SignInState, FormData>(signInMode, {});
  const picked = SIGN_IN_MODES.find((m) => m.area === mode) ?? SIGN_IN_MODES[0];
  return (
    <form action={action} className="flex flex-col gap-4" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-[16px] font-semibold text-ink">I am a</legend>
        {SIGN_IN_MODES.map((m) => {
          const on = m.area === mode;
          return (
            <label
              key={m.area}
              data-testid={`mode-${m.role}`}
              className={cx(
                "flex min-h-[64px] cursor-pointer items-center gap-3 rounded-[var(--fl-radius-md)] border-2 px-4 py-2",
                on ? "border-primary bg-primary-soft" : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <input type="radio" name="area" value={m.area} checked={on} onChange={() => setMode(m.area)} className="size-5 accent-[var(--fl-primary)]" />
              <span className="flex flex-col">
                <span className={cx("text-[17px] font-semibold", on ? "text-primary-ink" : "text-ink")}>{ROLE_LABEL[m.role]}</span>
                <span className="text-[14px] text-ink-2">{m.text}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {state.error && (
        <StateBanner tone="red" role="alert" testId="signin-error">
          {state.error}
        </StateBanner>
      )}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email ?? ""} autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Signing in…" : `Sign in as ${ROLE_LABEL[picked.role]}`}
      </Button>
    </form>
  );
}
