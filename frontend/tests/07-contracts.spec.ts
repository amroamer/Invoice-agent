import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Contracts", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/contracts");
  });

  test("hero header + 4 KPI cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Contract Portfolio" })).toBeVisible();
    await expect(page.getByTestId("kpi-active")).toBeVisible();
    await expect(page.getByTestId("kpi-total-value")).toBeVisible();
    await expect(page.getByTestId("kpi-expiring")).toBeVisible();
    await expect(page.getByTestId("kpi-at-risk")).toBeVisible();
  });

  test("contracts table renders rows", async ({ page }) => {
    await expect(page.getByTestId("contracts-table")).toBeVisible();
    const rows = page.getByTestId("contract-row");
    // At least one row exists in seed data
    await expect(rows.first()).toBeVisible();
  });

  test("contract number link routes to detail page", async ({ page }) => {
    const link = page.getByTestId("contract-row").first().getByRole("link").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/\/contracts\/[a-z0-9-]{8,}/);
    await link.click();
    await expect(page).toHaveURL(/\/contracts\/[a-z0-9-]{8,}/);
  });

  test("search bar filters table rows", async ({ page }) => {
    await page.getByTestId("contracts-search").fill("CON-2025");
    await expect(page.getByTestId("contracts-table")).toBeVisible();
  });
});
