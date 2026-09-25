import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_CLAIM_TOKEN, "admin tests need a claim token");

test("home leads to onboarding while no model is in chat", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/u);
  await expect(page.getByText("Step 1 · Source")).toBeVisible();
  await expect(page.getByText("Where should models come from?")).toBeVisible();
});

test("a source out of reach asks for a proxy, and back returns to the list", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "OpenAI-compatible" }).click();
  await expect(page.getByText("Step 2 · Key")).toBeVisible();
  // Nothing listens on port 9: unreachable directly, and a fresh install has no proxy to try.
  await page.getByLabel("API address").fill("http://127.0.0.1:9/v1");
  await page.getByRole("button", { name: "Check and connect" }).click();
  await expect(page.getByLabel("Proxy address")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Step 1 · Source")).toBeVisible();
});

test("settings open on language and region, with the admin sections", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings\/region$/u);
  await Promise.all(
    ["Sources", "Providers", "Proxies"].map((name) =>
      expect(page.getByRole("link", { name })).toBeVisible()
    )
  );
});
