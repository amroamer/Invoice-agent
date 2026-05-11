import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Invoices (Operations)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/invoices");
  });

  test("renders header + KPI strip", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Invoice Operations" })).toBeVisible();
    await expect(page.getByTestId("invoices-kpis")).toBeVisible();
    await expect(page.getByTestId("kpi-pending-review")).toBeVisible();
    await expect(page.getByTestId("kpi-ready")).toBeVisible();
    await expect(page.getByTestId("kpi-attention")).toBeVisible();
    await expect(page.getByTestId("kpi-paid")).toBeVisible();
    await expect(page.getByTestId("kpi-rejected")).toBeVisible();
  });

  test("AI Assistant rail is present with triage donut + risk signals", async ({ page }) => {
    const rail = page.getByTestId("ai-assistant-rail");
    await expect(rail).toBeVisible();
    await expect(rail.getByText("AI Assistant")).toBeVisible();
    await expect(rail.getByText("Triage summary")).toBeVisible();
    await expect(rail.getByText("Top risk signals")).toBeVisible();
    await expect(rail.getByText("Recommended next actions")).toBeVisible();
  });

  test("search bar filters invoices by number", async ({ page }) => {
    const rowsBefore = await page.getByTestId("invoice-row").count();
    if (rowsBefore === 0) test.skip();
    const firstInvoiceNumber = await page.getByTestId("invoice-row").first().locator("td").nth(1).innerText();
    await page.getByTestId("invoices-search").fill(firstInvoiceNumber.slice(0, 6));
    await expect(page.getByTestId("invoice-row").first()).toBeVisible();
  });

  test("clicking an invoice row navigates to review page", async ({ page }) => {
    const first = page.getByTestId("invoice-row").first();
    if ((await first.count()) === 0) test.skip();
    await first.click();
    await expect(page).toHaveURL(/\/invoices\/[\da-f-]{8,}/);
  });

  test("status KPI updates the active filter chip", async ({ page }) => {
    await page.getByTestId("kpi-paid").click();
    await expect(page).toHaveURL(/filter=Paid/);
  });

  test("reset clears all filters", async ({ page }) => {
    await page.getByTestId("invoices-search").fill("abc");
    await page.getByTestId("reset-filters").click();
    await expect(page.getByTestId("invoices-search")).toHaveValue("");
  });
});
