import { expect, test } from "@playwright/test";
import path from "path";
import fs from "fs";

import { login } from "./helpers";

function makeFixturePdf(): string {
  const tmp = path.join(test.info().outputDir, "fixture.pdf");
  fs.mkdirSync(test.info().outputDir, { recursive: true });
  fs.writeFileSync(tmp, "%PDF-1.4\n%E2E placeholder\n");
  return tmp;
}

test.describe("Upload invoice wizard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("step 1 — drop zone is visible and type chips render", async ({ page }) => {
    await page.getByTestId("upload-invoice-btn").click();
    await expect(page.getByTestId("upload-modal")).toBeVisible();
    await expect(page.getByTestId("upload-dropzone")).toBeVisible();
    await expect(page.getByTestId("upload-type-standard")).toBeVisible();
    await expect(page.getByTestId("upload-type-credit")).toBeVisible();
    await expect(page.getByTestId("upload-type-other")).toBeVisible();
  });

  test("step 1 'Review →' is disabled until a file is chosen", async ({ page }) => {
    await page.getByTestId("upload-invoice-btn").click();
    await expect(page.getByTestId("upload-next")).toBeDisabled();
  });

  test("can advance to step 2 once a file is attached", async ({ page }) => {
    const tmp = makeFixturePdf();
    await page.getByTestId("upload-invoice-btn").click();
    await page.getByTestId("upload-input").setInputFiles(tmp);
    await page.getByTestId("upload-next").click();
    await expect(page.getByTestId("upload-submit")).toBeVisible();
    await expect(page.getByText(/Invoice type/i)).toBeVisible();
  });

  test("Back returns from step 2 to step 1", async ({ page }) => {
    const tmp = makeFixturePdf();
    await page.getByTestId("upload-invoice-btn").click();
    await page.getByTestId("upload-input").setInputFiles(tmp);
    await page.getByTestId("upload-next").click();
    await page.getByTestId("upload-back").click();
    await expect(page.getByTestId("upload-next")).toBeVisible();
  });

  test("Escape and close button dismiss the modal", async ({ page }) => {
    await page.getByTestId("upload-invoice-btn").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("upload-modal")).toHaveCount(0);
    await page.getByTestId("upload-invoice-btn").click();
    await page.getByTestId("upload-close").click();
    await expect(page.getByTestId("upload-modal")).toHaveCount(0);
  });
});
