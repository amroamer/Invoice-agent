import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("System Health", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/system-health");
  });

  test("hero + 4 KPI cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible();
    await expect(page.getByTestId("kpi-healthy")).toBeVisible();
    await expect(page.getByTestId("kpi-latency")).toBeVisible();
    await expect(page.getByTestId("kpi-storage")).toBeVisible();
    await expect(page.getByTestId("kpi-accuracy")).toBeVisible();
  });

  test("service dependencies list shows postgres, redis, ollama", async ({ page }) => {
    await expect(page.getByTestId("service-postgres")).toBeVisible();
    await expect(page.getByTestId("service-redis")).toBeVisible();
    await expect(page.getByTestId("service-ollama")).toBeVisible();
  });

  test("expanding a service row reveals detail", async ({ page }) => {
    await page.getByTestId("service-postgres").click();
    await expect(page.getByTestId("service-detail-postgres")).toBeVisible();
  });

  test("environment + storage + data presence panels render", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Environment" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Storage", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data presence" })).toBeVisible();
  });
});
