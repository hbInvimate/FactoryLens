"use server";
// Sign-in and sign-out. Every attempt is counted against the rate limit and checked for the role
// of the page it came from. Wrong password, unknown email, disabled account or wrong role all
// get the same message.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { addressHash, clearFailures, clientAddress, isLocked, recordFailure } from "@/lib/auth/attempts";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { GENERIC_SIGN_IN_ERROR, LOGIN_LIMIT, SIGN_IN_PATH, canUse, safeNext, type Area } from "@/lib/auth/roles";
import { AuthNotConfigured, authConn, authSecret, getAuth } from "@/lib/auth/server";
import { findUser, normalizeEmail } from "@/lib/auth/users";
import { NotConfigured } from "@/lib/server/repo";

export interface SignInState {
  error?: string;
  email?: string;
}

let dummy: Promise<string> | null = null;
/** Checked against when there is no usable account, so a wrong email takes as long as a wrong password. */
const dummyHash = () => (dummy ??= hashPassword("not-a-real-password-for-timing"));

export async function signIn(area: Area, _prev: SignInState, form: FormData): Promise<SignInState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"), area);
  if (!email || !password) return { error: "Enter your email and password.", email };

  try {
    const h = await headers();
    const { db } = await authConn();
    const addr = addressHash(clientAddress(h), authSecret());
    if (await isLocked(db, email, addr)) {
      return { error: `Too many attempts. Wait ${LOGIN_LIMIT.minutes} minutes, then try again.`, email };
    }
    const user = await findUser(db, email);
    let ok = false;
    if (user && !user.disabled && canUse(user.role, area)) {
      const auth = await getAuth();
      try {
        await auth.api.signInEmail({ body: { email, password, rememberMe: true }, headers: h });
        ok = true;
      } catch {
        ok = false;
      }
    } else {
      await verifyPassword(await dummyHash(), password);
    }
    if (!ok) {
      await recordFailure(db, email, addr);
      return { error: GENERIC_SIGN_IN_ERROR, email };
    }
    await clearFailures(db, email, addr);
  } catch (e) {
    if (e instanceof AuthNotConfigured || e instanceof NotConfigured) return { error: e.message, email };
    throw e;
  }
  redirect(next);
}

export async function signOut(area: Area): Promise<void> {
  try {
    const auth = await getAuth();
    await auth.api.signOut({ headers: await headers() });
  } catch (e) {
    if (!(e instanceof AuthNotConfigured || e instanceof NotConfigured)) console.error(e);
  }
  redirect(SIGN_IN_PATH[area]);
}
