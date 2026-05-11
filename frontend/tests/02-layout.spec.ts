import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test.describe("Layout shell", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("sidebar shows all admin nav items", async ({ page }) => {
    const items = [
      "nav-home",
      "nav-invoices",
      "nav-projects",
      "nav-vendors",
      "nav-contracts",
      "nav-historical-invoices",
      "nav-users",
      "nav-audit",
      "nav-system-health",
      "nav-settings",
    ];
    for (const id of items) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test("top bar has upload button + notifications + user chip", async ({ page }) => {
    await expect(page.getByTestId("upload-invoice-btn")).toBeVisible();
    await expect(page.getByTestId("notifications-btn")).toBeVisible();
    await expect(page.getByTestId("topbar-name")).toContainText(/admin|System Administrator/i);
  });

  test("user chip in sidebar navigates to settings", async ({ page }) => {
    await page.getByTestId("user-chip").click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("sign out returns the user to login", async ({ page }) => {
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("clicking the upload button opens the multi-step wizard", async ({ page }) => {
    await page.getByTestId("upload-invoice-btn").click();
    await expect(page.getByTestId("upload-modal")).toBeVisible();
    await expect(page.getByTestId("upload-step-1")).toBeVisible();
    await expect(page.getByTestId("upload-step-2")).toBeVisible();
    await expect(page.getByTestId("upload-step-3")).toBeVisible();
    await page.getByTestId("upload-close").click();
    await expect(page.getByTestId("upload-modal")).toHaveCount(0);
  });
});
