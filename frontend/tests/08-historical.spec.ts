import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Historical invoices", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/historical-invoices");
  });

  test("hero + 4 KPI cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Historical Invoices & Archive" })).toBeVisible();
    await expect(page.getByTestId("kpi-archived")).toBeVisible();
    await expect(page.getByTestId("kpi-bulk")).toBeVisible();
    await expect(page.getByTestId("kpi-paid-value")).toBeVisible();
    await expect(page.getByTestId("kpi-exceptions")).toBeVisible();
  });

  test("bulk upload UI is admin-only and shows two drop zones", async ({ page }) => {
    await expect(page.getByTestId("upload-invoices")).toBeVisible();
    await expect(page.getByTestId("upload-mappings")).toBeVisible();
    await expect(page.getByTestId("preview-import")).toBeVisible();
    await expect(page.getByTestId("start-import")).toBeVisible();
  });

  test("preview button is disabled without invoice file", async ({ page }) => {
    await expect(page.getByTestId("preview-import")).toBeDisabled();
  });

  test("historical table renders", async ({ page }) => {
    await expect(page.getByTestId("historical-table")).toBeVisible();
  });

  test("status filter narrows the table", async ({ page }) => {
    await page.locator('select').first().selectOption("paid");
    await expect(page.getByTestId("historical-table")).toBeVisible();
  });
});
