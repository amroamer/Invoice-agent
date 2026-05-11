import { expect, test } from "@playwright/test";

import { ADMIN, OFFICER } from "./helpers";

test.describe("Login page", () => {
  test("renders the KPMG brand and demo credentials hint", async ({ page }) => {
    await page.goto("/InvoiceAgent/login");
    await expect(page.getByTestId("login-form")).toBeVisible();
    await expect(page.getByText("Finance Invoicing Agent")).toBeVisible();
    await expect(page.getByText(/Admin!pass123/i)).toBeVisible();
  });

  test("rejects invalid credentials with an error message", async ({ page }) => {
    await page.goto("/InvoiceAgent/login");
    await page.getByTestId("login-username").fill("admin");
    await page.getByTestId("login-password").fill("WrongPassword!1");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toBeVisible();
  });

  test("admin can sign in and land on dashboard", async ({ page }) => {
    await page.goto("/InvoiceAgent/login");
    await page.getByTestId("login-username").fill(ADMIN.username);
    await page.getByTestId("login-password").fill(ADMIN.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/InvoiceAgent/");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("topbar-name")).toBeVisible();
  });

  test("officer can sign in but cannot see admin-only nav", async ({ page }) => {
    await page.goto("/InvoiceAgent/login");
    await page.getByTestId("login-username").fill(OFFICER.username);
    await page.getByTestId("login-password").fill(OFFICER.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/InvoiceAgent/");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    // Admin-only links must be hidden for officer
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
    await expect(page.getByTestId("nav-audit")).toHaveCount(0);
    await expect(page.getByTestId("nav-system-health")).toHaveCount(0);
  });

  test("requires both username and password", async ({ page }) => {
    await page.goto("/InvoiceAgent/login");
    const submit = page.getByTestId("login-submit");
    await submit.click();
    // The native required attribute should keep us on the login page
    await expect(page).toHaveURL(/\/login$/);
  });
});
