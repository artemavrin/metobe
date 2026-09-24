import { expect, test } from "@playwright/test";

const email = "nobody@example.com";

test("code from a login link is prefilled without React input warnings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await page.goto(
    `/login/verify?email=${encodeURIComponent(email)}&code=123456`
  );
  // React reports the controlled/uncontrolled mismatch during hydration, after the first paint.
  await page.waitForLoadState("networkidle");

  await expect(page.locator("input[name=code]")).toHaveValue("123456");
  expect(
    errors.filter((error) => error.includes("both value and defaultValue"))
  ).toEqual([]);
});

test("typing six digits submits the code", async ({ page }) => {
  await page.goto(`/login/verify?email=${encodeURIComponent(email)}`);
  await page.locator("input[name=code]").click();
  await page.keyboard.type("111111");

  await expect(
    page.getByText("The code is wrong or has expired")
  ).toBeVisible();
});
