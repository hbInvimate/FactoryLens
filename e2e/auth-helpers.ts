import type { Page } from "@playwright/test";
import { TEST_USERS } from "../lib/auth/testUsers";
import type { Role } from "../lib/auth/roles";

/** Saved cookie of the signed-in test admin (git-ignored). */
export const ADMIN_STATE = "e2e/.auth/admin.json";

export type Who = Role | "locked" | "technician2";

const EMAIL: Record<Who, string> = {
  technician: "technician@test.local",
  technician2: "technician2@test.local",
  engineer: "engineer@test.local",
  admin: "admin@test.local",
  locked: "locked@test.local",
};

export function testUser(who: Who) {
  const u = TEST_USERS.find((x) => x.email === EMAIL[who]);
  if (!u) throw new Error(`No test user for ${who}`);
  return u;
}

/** Fills in a sign-in page and submits. `password` overrides the right one. */
export async function signInAs(page: Page, role: Who, path: "/signin" | "/dashboard/signin", password?: string) {
  const u = testUser(role);
  if (new URL(page.url()).pathname !== path) await page.goto(path);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(password ?? u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
