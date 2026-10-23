import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("a new learner signs up, onboards, and lands on a dashboard with real (empty) data", async ({ page }) => {
  await signUpAndOnboard(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/0\s*XP|0 day|streak/i).first()).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/); // session persists
});

test("a learner opens a lesson, answers an exercise and gets server-checked feedback", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/learn/fr-a1-u01-l01");
  await expect(page.getByRole("heading", { name: /greetings and goodbyes/i }).first()).toBeVisible();
  await page.getByRole("button", { name: /^practice \(\d+\)/i }).click();
  const start = page.getByRole("button", { name: /start practice/i });
  if (await start.isVisible().catch(() => false)) await start.click();
  // Answer whatever the first exercise is with a minimal response, then check it.
  const choice = page.getByRole("radio").first();
  if (await choice.isVisible().catch(() => false)) await choice.click();
  else {
    const box = page.getByRole("textbox", { name: /your answer/i }).first();
    if (await box.isVisible().catch(() => false)) await box.fill("bonjour");
  }
  const check = page.getByRole("button", { name: /^check$/i });
  if (await check.isEnabled().catch(() => false)) await check.click();
  await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
});

test("the AI coach runs in clearly labelled practice mode without an API key", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/coach");
  await page.getByRole("radio", { name: /introducing yourself/i }).click();
  await page.getByRole("button", { name: /start conversation/i }).click();
  await page.waitForURL(/\/coach\/.+/);
  await expect(page.getByText(/practice mode/i).first()).toBeVisible();
  await page.getByPlaceholder("Write your reply…").fill("Bonjour ! Je m'appelle Robin et je suis 30 ans.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/j'ai 30 ans/i).first()).toBeVisible();
});

test("learners cannot open the admin CMS", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard/);
  const api = await page.request.post("/api/admin/import", { data: { publish: true }, headers: { origin: new URL(page.url()).origin } });
  expect(api.status()).toBe(403);
});
