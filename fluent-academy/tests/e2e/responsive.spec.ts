import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signUpAndOnboard } from "./helpers";

test("public pages fit a phone screen", async ({ page }) => {
  for (const path of ["/", "/pricing", "/languages", "/login", "/signup"]) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
});

test("the learner app works on a phone", async ({ page }) => {
  await signUpAndOnboard(page);
  for (const path of ["/dashboard", "/learn", "/learn/fr-a1-u01-l01", "/coach", "/vocabulary", "/progress", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
