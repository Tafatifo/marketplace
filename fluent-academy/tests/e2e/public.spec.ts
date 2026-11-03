import { expect, test } from "@playwright/test";

test("marketing pages render with real plans and every course language", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByText("Premium").first()).toBeVisible();
  await expect(page.getByText(/\$12\.99|12\.99/).first()).toBeVisible();
  await page.goto("/languages");
  for (const name of ["English", "French", "Spanish", "German", "Danish"]) await expect(page.getByText(name).first()).toBeVisible();
  for (const path of ["/features", "/method", "/privacy", "/terms", "/credits"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test("protected pages redirect to login when signed out", async ({ page }) => {
  for (const path of ["/dashboard", "/learn", "/coach", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("login rejects a wrong password without revealing whether the account exists", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody-here@example.com");
  await page.getByLabel("Password", { exact: true }).fill("definitely not right");
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
});

test("the health endpoint reports service states without configuration values", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.checks.find((c: { name: string }) => c.name === "Database").state).toBe("ok");
  expect(JSON.stringify(body)).not.toMatch(/sk_|whsec_|password|token/i);
});
