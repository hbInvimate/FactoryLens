import type { Page } from "@playwright/test";
import { TEST_USERS } from "../lib/auth/testUsers";
import type { Role } from "../lib/auth/roles";

/** Saved cookie of the signed-in test admin (git-ignored). */
export const ADMIN_STATE = "e2e/.auth/admin.json";

export function testUser(role: Role | "locked") {
  const u = TEST_USERS.find((x) => (role === "locked" ? x.email.startsWith("locked@") : x.role === role && !x.email.startsWith("locked@")));
  if (!u) throw new Error(`No test user for ${role}`);
  return u;
}

/** Fills in a sign-in page and submits. `password` overrides the right one. */
export async function signInAs(page: Page, role: Role | "locked", path: "/signin" | "/dashboard/signin", password?: string) {
  const u = testUser(role);
  if (!page.url().includes(path)) await page.goto(path);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(password ?? u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
