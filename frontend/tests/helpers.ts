import { type Page, expect } from "@playwright/test";

export const BASE_PATH = "/InvoiceAgent";

export const ADMIN = { username: "admin", password: "Admin!pass123" };
export const OFFICER = { username: "officer", password: "Officer!pass123" };

export async function login(page: Page, who: { username: string; password: string } = ADMIN) {
  await page.goto(`${BASE_PATH}/login`);
  await page.getByTestId("login-username").fill(who.username);
  await page.getByTestId("login-password").fill(who.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(`**${BASE_PATH}/`);
  await expect(page.getByTestId("sidebar")).toBeVisible();
}

export async function goto(page: Page, path: string) {
  const target = path.startsWith("/") ? `${BASE_PATH}${path}` : `${BASE_PATH}/${path}`;
  await page.goto(target);
  await expect(page.getByTestId("sidebar")).toBeVisible();
}
