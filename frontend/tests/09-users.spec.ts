import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Users & Access", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/users");
  });

  test("hero + 4 KPI cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Users & Access" })).toBeVisible();
    await expect(page.getByTestId("kpi-total-users")).toBeVisible();
    await expect(page.getByTestId("kpi-sessions")).toBeVisible();
    await expect(page.getByTestId("kpi-admins")).toBeVisible();
    await expect(page.getByTestId("kpi-invites")).toBeVisible();
  });

  test("invite user button reveals form", async ({ page }) => {
    await page.getByTestId("invite-user-btn").click();
    await expect(page.getByTestId("user-username")).toBeVisible();
    await expect(page.getByTestId("user-email")).toBeVisible();
    await expect(page.getByTestId("user-role")).toBeVisible();
  });

  test("create user is disabled without password length 10+", async ({ page }) => {
    await page.getByTestId("invite-user-btn").click();
    await page.getByTestId("user-username").fill("e2e_user");
    await page.getByTestId("user-email").fill("e2e_user@e2e.test");
    await page.getByTestId("user-password").fill("short");
    await expect(page.getByTestId("user-submit")).toBeDisabled();
    await page.getByTestId("user-password").fill("LongerSecret1!");
    await expect(page.getByTestId("user-submit")).toBeEnabled();
  });

  test("users table shows MFA column with enabled state", async ({ page }) => {
    await expect(page.getByTestId("users-table")).toBeVisible();
    await expect(page.getByText("MFA").first()).toBeVisible();
    await expect(page.getByText("Enabled").first()).toBeVisible();
  });

  test("clear filters button resets the search box", async ({ page }) => {
    await page.getByTestId("users-search").fill("admin");
    await page.getByTestId("users-clear").click();
    await expect(page.getByTestId("users-search")).toHaveValue("");
  });
});
