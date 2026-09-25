import { expect, test as setup } from "@playwright/test";

import { ADMIN_STATE } from "../playwright.config";

const token = process.env.E2E_CLAIM_TOKEN;

// A fresh install: the claim link creates the administrator and signs them in without email. With no source
// yet, home sends them straight to onboarding — the gate is checked on the way.
setup("claim the installation", async ({ page }) => {
  setup.skip(!token, "no claim token: the stack is claimed already");
  await page.goto(`/claim?token=${token}`);
  await page.getByLabel("Your name").fill("E2E Admin");
  await page.getByLabel("Email").fill("admin@e2e.test");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/u);
  await page.context().storageState({ path: ADMIN_STATE });
});
