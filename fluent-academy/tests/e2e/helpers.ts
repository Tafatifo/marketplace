import { expect, type Page } from "@playwright/test";

export const PASSWORD = "a long and unusual passphrase";

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Signs up through the UI and completes onboarding for French A1. */
export async function signUpAndOnboard(page: Page, opts: { name?: string; email?: string } = {}) {
  const email = opts.email ?? uniqueEmail("learner");
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(opts.name ?? "Robin Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /terms/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/onboarding/);

  await page.locator("select#native").selectOption("en");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("radio", { name: /français/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("radio", { name: /A1/ }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("radiogroup").getByRole("radio").first().click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /continue/i }).click(); // daily goal (pre-selected)
  await page.getByRole("button", { name: /continue/i }).click(); // focus areas
  await page.getByRole("button", { name: /go to my dashboard/i }).click();
  await page.waitForURL(/\/dashboard/);
  return { email };
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}
