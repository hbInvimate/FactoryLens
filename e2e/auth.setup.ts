// Signs in once per run and saves the cookie for the other tests. The admin may use both the check app
// and the dashboard, so the existing tests run unchanged. The auth tests start signed out.
import { expect, test as setup } from "@playwright/test";
import { ADMIN_STATE, signInAs } from "./auth-helpers";

setup("sign in as the test admin", async ({ page }) => {
  await signInAs(page, "admin", "/signin");
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: ADMIN_STATE });
});
