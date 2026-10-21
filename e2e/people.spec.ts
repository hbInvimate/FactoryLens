// Stage 3: people in the data. Each new session is stored under the signed-in Quality Technician;
// Session history shows only their own; an ended sign-in during a check never loses work.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { NOT_OWNER_ERROR } from "../lib/auth/roles";
import { signInAs, testUser, type Who } from "./auth-helpers";
import { doSteps, startCheck, waitSaved } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

async function signedIn(page: Page, who: Who) {
  await signInAs(page, who, "/signin");
  await expect(page).toHaveURL(/localhost:\d+\/tasks$/);
}

/** Saves an empty session through the API, with a typed label the server must not trust. */
async function postSession(request: APIRequestContext): Promise<string> {
  const id = crypto.randomUUID();
  const meta = { id, part: "B-pillar outer", sop: "First-off check, rev A", fixture: "Laser cell 3 · FX-014", operator: "Someone else typed this", createdAt: Date.now() - 60_000 };
  const res = await request.post(`/api/sessions/${id}/actions`, { data: { meta, actions: [] } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return id;
}

async function serverActions(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/sessions/${id}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { meta: { operator: string }; actions: { type: string; step?: number }[] };
}

test("the start form shows the signed-in Quality Technician, read-only, and the session is stored under them", async ({ page, context }) => {
  await signedIn(page, "technician");
  await page.goto("/");
  const me = testUser("technician").name;
  await expect(page.getByTestId("operator-name")).toHaveText(me);
  await expect(page.getByRole("textbox", { name: "Quality Technician" })).toHaveCount(0);
  const id = await startCheck(page);
  await doSteps(page, 1, 1);
  await waitSaved(page);
  expect((await serverActions(context.request, id)).meta.operator).toBe(me);

  // A label typed by the browser is ignored: the server uses the signed-in name.
  const other = await postSession(context.request);
  expect((await serverActions(context.request, other)).meta.operator).toBe(me);
});

test("Session history shows only the signed-in Quality Technician's own sessions", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();
  await signedIn(p1, "technician");
  await signedIn(p2, "technician2");
  const mine1 = await postSession(ctx1.request);
  const mine2 = await postSession(ctx2.request);

  await p2.goto("/sessions");
  await expect(p2.getByTestId("history-scope")).toContainText(testUser("technician2").name);
  await expect(p2.locator(`tr[data-session="${mine2}"]`)).toBeVisible();
  await expect(p2.locator(`tr[data-session="${mine1}"]`)).toHaveCount(0);
  await expect(p2.getByLabel("Include sample data")).toHaveCount(0);
  const list = (await (await ctx2.request.get("/api/sessions")).json()) as { sessions: { id: string }[] };
  expect(list.sessions.map((s) => s.id)).toContain(mine2);
  expect(list.sessions.map((s) => s.id)).not.toContain(mine1);

  // Someone else's session cannot be opened or written to.
  expect((await ctx2.request.get(`/api/sessions/${mine1}`)).status()).toBe(404);
  const write = await ctx2.request.post(`/api/sessions/${mine1}/actions`, {
    data: { meta: { id: mine1, part: "p", sop: "s", fixture: "f", operator: "o", createdAt: Date.now() }, actions: [] },
  });
  expect(write.status()).toBe(403);
  expect(await write.json()).toMatchObject({ code: "not_owner", error: NOT_OWNER_ERROR });
  await p2.goto(`/sessions/${mine1}`);
  await expect(p2.getByText("This page could not be found")).toBeVisible();

  // An admin sees everyone's.
  const ctxA = await browser.newContext();
  const pa = await ctxA.newPage();
  await signedIn(pa, "admin");
  await pa.goto("/sessions?sample=0");
  await expect(pa.locator(`tr[data-session="${mine1}"]`)).toBeVisible();
  await expect(pa.locator(`tr[data-session="${mine2}"]`)).toBeVisible();
  await Promise.all([ctx1.close(), ctx2.close(), ctxA.close()]);
});

test("sign-in ends during a check: keep working, sign in without leaving, everything is saved", async ({ page, context }) => {
  await signedIn(page, "technician");
  const id = await startCheck(page);
  await doSteps(page, 1, 2);
  await waitSaved(page);

  await context.clearCookies(); // the 12 hours are over
  await doSteps(page, 3, 3);
  await expect(page.getByTestId("signin-needed")).toContainText("Your sign-in has ended. Your work is safe");
  await expect(page.getByTestId("connection")).toHaveText("Sign-in needed");
  const dialog = page.getByRole("dialog", { name: "Sign in again to save" });
  await expect(dialog).toBeVisible();

  // Not now: the check carries on, and the work stays queued on this device.
  await dialog.getByRole("button", { name: "Not now, keep working" }).click();
  await doSteps(page, 4, 4);
  await expect(page.getByTestId("signin-needed")).toContainText(/\d+ changes are kept on this device/);
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));

  await page.getByRole("button", { name: "Sign in to save" }).click();
  await dialog.getByLabel("Email").fill(testUser("technician").email);
  await dialog.getByLabel("Password").fill(testUser("technician").password);
  await dialog.getByRole("button", { name: "Sign in and save" }).click();
  await waitSaved(page);
  await expect(page.getByTestId("signin-needed")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));
  const steps = (await serverActions(context.request, id)).actions.filter((a) => a.type === "next_step").map((a) => a.step);
  expect(steps).toEqual(expect.arrayContaining([1, 2, 3, 4]));
});

test("signed out while offline: the queue survives a reload and the sign-in page, then syncs", async ({ page, context }) => {
  await signedIn(page, "technician");
  const id = await startCheck(page);
  await doSteps(page, 1, 1);
  await waitSaved(page);

  await context.setOffline(true);
  await doSteps(page, 2, 3);
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await context.clearCookies();
  await context.setOffline(false);
  await expect(page.getByTestId("signin-needed")).toBeVisible();

  // Even a reload loses nothing: the sign-in page brings her back to the same check.
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/signin\\?next=%2Fcheck%2F${id}$`));
  await signInAs(page, "technician", "/signin");
  await expect(page).toHaveURL(new RegExp(`/check/${id}$`));
  await waitSaved(page);
  const steps = (await serverActions(context.request, id)).actions.filter((a) => a.type === "next_step").map((a) => a.step);
  expect(steps).toEqual(expect.arrayContaining([1, 2, 3]));
});

test("signing in as another Quality Technician does not save into the check; the right person does", async ({ page, context }) => {
  await signedIn(page, "technician");
  const id = await startCheck(page);
  await doSteps(page, 1, 1);
  await waitSaved(page);

  await context.clearCookies();
  await doSteps(page, 2, 2);
  const signIn = async (who: Who) => {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill(testUser(who).email);
    await dialog.getByLabel("Password").fill(testUser(who).password);
    await dialog.getByRole("button", { name: "Sign in and save" }).click();
  };
  await signIn("technician2");
  await expect(page.getByRole("dialog", { name: "Sign in as the Quality Technician of this check" })).toBeVisible();
  await expect(page.getByTestId("signin-needed")).toContainText("started by another Quality Technician");
  await signIn("technician");
  await waitSaved(page);
  const steps = (await serverActions(context.request, id)).actions.filter((a) => a.type === "next_step").map((a) => a.step);
  expect(steps).toEqual(expect.arrayContaining([1, 2]));
});
