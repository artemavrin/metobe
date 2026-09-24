import { expect, test } from "@playwright/test";

// The same answer for unknown addresses is by design (no probing), so these run without a real account.
const email = "nobody@example.com";

test("a wrong code clears the slots; another email keeps the typed one", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Get a sign-in link" }).click();

  await expect(
    page.getByRole("heading", { name: "Code from the email" })
  ).toBeVisible();
  await expect(page.getByText(/Send again in \d+s/u)).toBeVisible();

  await page.getByLabel("Code from the email").click();
  await page.keyboard.type("111111");
  await expect(
    page.getByText("The code is wrong or has expired")
  ).toBeVisible();
  await expect(page.getByLabel("Code from the email")).toHaveValue("");

  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Email")).toHaveValue(email);
});

test.describe("on a phone", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("the brand clips are not downloaded", async ({ page }) => {
    const media: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/login/brand-")) {
        media.push(request.url());
      }
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(media).toEqual([]);
  });
});

test("the brand panel plays one clip on a wide screen", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  const clips = new Set<string>();
  page.on("request", (request) => {
    if (request.url().endsWith(".webm")) {
      clips.add(request.url());
    }
  });
  await page.goto("/login");
  await expect(page.locator("aside video")).toHaveJSProperty("paused", false);
  expect(clips.size).toBe(1);
});
