import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Review/decide page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/invoices");
  });

  test("clicking an invoice row opens review page", async ({ page }) => {
    const row = page.getByTestId("invoice-row").first();
    if ((await row.count()) === 0) test.skip();
    await row.click();
    await expect(page).toHaveURL(/\/invoices\/[a-f0-9-]{8,}/);
  });

  test("review page navigates back to invoices list", async ({ page }) => {
    const row = page.getByTestId("invoice-row").first();
    if ((await row.count()) === 0) test.skip();
    await row.click();
    await expect(page).toHaveURL(/\/invoices\/[a-f0-9-]{8,}/);
    await page.goBack();
    await expect(page).toHaveURL(/\/invoices/);
  });
});
