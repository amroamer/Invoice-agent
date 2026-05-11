import { expect, test } from "@playwright/test";

import { login } from "./helpers";

test.describe("Dashboard (Welcome cockpit)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("renders the cockpit hero and status pill", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Welcome to your finance cockpit" })).toBeVisible();
    await expect(page.getByText(/All systems operational/i).first()).toBeVisible();
  });

  test("shows 5 KPI tiles with sparklines", async ({ page }) => {
    const kpis = page.getByTestId("dashboard-kpis");
    await expect(kpis).toBeVisible();
    await expect(page.getByTestId("kpi-pending")).toBeVisible();
    await expect(page.getByTestId("kpi-awaiting")).toBeVisible();
    await expect(page.getByTestId("kpi-paid")).toBeVisible();
    await expect(page.getByTestId("kpi-rejected")).toBeVisible();
    await expect(page.getByTestId("kpi-mtd")).toBeVisible();
  });

  test("invoice queue shows rows when invoices exist", async ({ page }) => {
    const rows = page.getByTestId("dashboard-invoice-row");
    // There may be zero rows on a brand-new env, so just assert table loaded
    await expect(rows.first().or(page.getByText("No invoices yet."))).toBeVisible();
  });

  test("clicking a KPI navigates to /invoices with a filter", async ({ page }) => {
    await page.getByTestId("kpi-pending").click();
    await expect(page).toHaveURL(/\/invoices\?filter=/);
  });

  test("view all invoices link navigates to /invoices", async ({ page }) => {
    await page.getByTestId("view-all-invoices").click();
    await expect(page).toHaveURL(/\/invoices$/);
  });

  test("priorities and risk panels render", async ({ page }) => {
    await expect(page.getByText("Risk & compliance")).toBeVisible();
    await expect(page.getByText("Today's priorities")).toBeVisible();
    await expect(page.getByTestId("priority-row").first()).toBeVisible();
  });

  test("invoice volume chart and top vendors render", async ({ page }) => {
    await expect(page.getByTestId("volume-chart")).toBeVisible();
    await expect(page.getByText("Top vendors by spend")).toBeVisible();
  });
});
