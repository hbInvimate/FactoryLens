"use client";
// The sign-in ended (or someone else is signed in) while a check is open. The check stays on screen and
// keeps working; every action stays queued on this device. Signing in here sends them all.
import { useActionState, useEffect, useRef, useState } from "react";
import { signInHere, type SignInState } from "@/app/auth-actions";
import type { SyncState } from "@/lib/client/useCheckSession";
import { Btn, Dot } from "../ui";
import { Modal } from "./Dialogs";

const INPUT = "tap w-full rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[20px] text-ink";

function why(sync: SyncState): string {
  const n = `${sync.pending} ${sync.pending === 1 ? "change is" : "changes are"} kept on this device`;
  return sync.auth === "not_owner"
    ? `This check was started by another Quality Technician. Your work is safe: ${n}. Sign in as the person who started it to save them.`
    : `Your sign-in has ended. Your work is safe: ${n}. Sign in to save them. You can keep working meanwhile.`;
}

function Form({ onSignedIn, onLater }: { onSignedIn: () => void; onLater: () => void }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInHere, {});
  const handled = useRef<SignInState | null>(null);
  useEffect(() => {
    // Once per successful sign-in.
    if (state.ok && handled.current !== state) {
      handled.current = state;
      onSignedIn();
    }
  }, [state, onSignedIn]);
  return (
    <form action={action} className="flex flex-col gap-4" aria-busy={pending}>
      {state.error && (
        <p role="alert" data-testid="prompt-error" className="rounded-[var(--fl-radius-md)] border border-red-line bg-red-soft px-4 py-2 text-[18px] text-red-ink">
          {state.error}
        </p>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[17px] text-muted">Email</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email ?? ""} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[17px] text-muted">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className={INPUT} />
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        <Btn onClick={onLater}>Not now, keep working</Btn>
        <Btn type="submit" variant="success" disabled={pending}>
          {pending ? "Signing in…" : "Sign in and save"}
        </Btn>
      </div>
    </form>
  );
}

export function SignInPrompt({ sync, onSignedIn }: { sync: SyncState; onSignedIn: () => void }) {
  const [open, setOpen] = useState(true);
  const [shownFor, setShownFor] = useState(sync.auth);
  // Open the dialog again each time a new sign-in is needed.
  if (sync.auth !== shownFor) {
    setShownFor(sync.auth);
    if (sync.auth) setOpen(true);
  }
  if (!sync.auth) return null;
  return (
    <>
      <div role="alert" data-testid="signin-needed" className="flex flex-none flex-wrap items-center gap-4 bg-amber-soft px-8 py-2 text-[18px] text-amber-ink">
        <Dot color="amber" />
        <span className="flex-1">{why(sync)}</span>
        <Btn variant="amber" onClick={() => setOpen(true)}>
          Sign in to save
        </Btn>
      </div>
      {open && (
        <Modal title={sync.auth === "not_owner" ? "Sign in as the Quality Technician of this check" : "Sign in again to save"} onClose={() => setOpen(false)}>
          <p className="text-[18px] text-ink-2">{why(sync)}</p>
          <Form
            onSignedIn={() => {
              setOpen(false);
              onSignedIn();
            }}
            onLater={() => setOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}
