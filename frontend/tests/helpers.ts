import { type Page, expect } from "@playwright/test";

export const ADMIN = { username: "admin", password: "Admin!pass123" };
export const OFFICER = { username: "officer", password: "Officer!pass123" };

export async function login(page: Page, who: { username: string; password: string } = ADMIN) {
  await page.goto("/login");
  await page.getByTestId("login-username").fill(who.username);
  await page.getByTestId("login-password").fill(who.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
  await expect(page.getByTestId("sidebar")).toBeVisible();
}

export async function goto(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("sidebar")).toBeVisible();
}
