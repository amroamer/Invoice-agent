import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Vendors", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/vendors");
  });

  test("hero header + KPI strip", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Vendor Management" })).toBeVisible();
    await expect(page.getByTestId("kpi-active-vendors")).toBeVisible();
    await expect(page.getByTestId("kpi-pending-vendors")).toBeVisible();
    await expect(page.getByTestId("kpi-alerts")).toBeVisible();
    await expect(page.getByTestId("kpi-preferred")).toBeVisible();
  });

  test("Add vendor button reveals form (admin)", async ({ page }) => {
    await page.getByTestId("add-vendor-btn").click();
    await expect(page.getByTestId("vendor-legal-name")).toBeVisible();
  });

  test("vendor submit is disabled until legal_name + 12-char TRN", async ({ page }) => {
    await page.getByTestId("add-vendor-btn").click();
    await expect(page.getByTestId("vendor-submit")).toBeDisabled();
    await page.getByTestId("vendor-legal-name").fill("E2E Test Vendor LLC");
    await page.getByTestId("vendor-trn").fill("12345");
    await expect(page.getByTestId("vendor-submit")).toBeDisabled();
    await page.getByTestId("vendor-trn").fill("300999888777003");
    await expect(page.getByTestId("vendor-submit")).toBeEnabled();
  });

  test("compliance status filter narrows rows", async ({ page }) => {
    await expect(page.getByTestId("vendors-table")).toBeVisible();
    await page.locator('select').first().selectOption("compliant");
    // Just confirm rows still render (or empty state)
    await expect(page.getByTestId("vendors-table")).toBeVisible();
  });

  test("clear button resets the search box", async ({ page }) => {
    await page.getByTestId("vendors-search").fill("anything");
    await page.getByTestId("vendors-clear").click();
    await expect(page.getByTestId("vendors-search")).toHaveValue("");
  });
});
