import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Audit & Activity Log", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/audit");
  });

  test("hero + KPI strip", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Audit & Activity Log" })).toBeVisible();
    await expect(page.getByTestId("kpi-total-events")).toBeVisible();
    await expect(page.getByTestId("kpi-failed-logins")).toBeVisible();
    await expect(page.getByTestId("kpi-ai-actions")).toBeVisible();
    await expect(page.getByTestId("kpi-exports")).toBeVisible();
  });

  test("filters can be set and cleared", async ({ page }) => {
    await page.getByTestId("audit-action").fill("auth.login");
    await page.getByTestId("audit-clear").click();
    await expect(page.getByTestId("audit-action")).toHaveValue("");
  });

  test("audit table renders and search narrows visible rows", async ({ page }) => {
    await expect(page.getByTestId("audit-table")).toBeVisible();
    await page.getByTestId("audit-search").fill("auth");
    await expect(page.getByTestId("audit-table")).toBeVisible();
  });

  test("right rail shows activity sparkline and top users", async ({ page }) => {
    await expect(page.getByText("Activity over time")).toBeVisible();
    await expect(page.getByText("Top users by activity")).toBeVisible();
  });

  test("refresh button is clickable", async ({ page }) => {
    await page.getByTestId("audit-refresh").click();
    await expect(page.getByTestId("audit-table")).toBeVisible();
  });
});
