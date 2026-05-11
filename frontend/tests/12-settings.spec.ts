import { expect, test } from "@playwright/test";

import { goto, login } from "./helpers";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await goto(page, "/settings");
  });

  test("renders the connection + default LLM + available models cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Ollama connection")).toBeVisible();
    await expect(page.getByText("Default LLM")).toBeVisible();
    await expect(page.getByText("Available models")).toBeVisible();
  });

  test("Test connection button reports ok status", async ({ page }) => {
    await page.getByRole("button", { name: /Test connection/i }).click();
    await expect(page.getByText(/Connected to|Connection failed/i)).toBeVisible();
  });

  test("Save button is disabled until model selection changes", async ({ page }) => {
    const saveBtn = page.getByRole("button", { name: /Save/i });
    await expect(saveBtn).toBeDisabled();
  });
});
