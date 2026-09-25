import { expect, test } from "@playwright/test";

// D31: the language comes from the `locale` cookie, then Accept-Language, then English.
// Headings, not text: after a refresh Next's route announcer repeats the h1 for screen readers.

test("an English browser gets English", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign in to Metobe" })
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test.describe("a Russian browser", () => {
  test.use({ locale: "ru-RU" });

  test("gets Russian without choosing anything", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Вход в Metobe" })
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });
});

test("the picker switches the language and it sticks across reloads", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page
    .getByRole("group", { name: "Language" })
    .getByRole("button", { name: "Русский" })
    .click();

  // The server action sets the cookie; the page re-renders on the server in Russian.
  await expect(
    page.getByRole("heading", { name: "Вход в Metobe" })
  ).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "locale")?.value).toBe("ru");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Вход в Metobe" })
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("the browser reports its time zone once", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  await page.goto("/login");
  // Next URL-encodes cookie values and decodes them when the server reads them.
  await expect
    .poll(async () => {
      const cookies = await context.cookies();
      const tz = cookies.find((c) => c.name === "tz")?.value;
      return tz && decodeURIComponent(tz);
    })
    .toBe("Asia/Tokyo");
  await context.close();
});

test("settings need a signed-in user", async ({ page }) => {
  await page.goto("/settings/region");
  // After signing in the user comes back here.
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fregion$/u);
});
