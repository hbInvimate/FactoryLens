"use client";
import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/auth-actions";
import { Button, Field, Input, StateBanner } from "@/components/ds";
import type { Area } from "@/lib/auth/roles";

export function SignInForm({ area, next }: { area: Area; next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn.bind(null, area), {});
  return (
    <form action={action} className="flex flex-col gap-4" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
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
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
