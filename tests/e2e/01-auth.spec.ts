import { expect, test } from "@playwright/test";

test("acceder a /revision sin sesión redirige a /login", async ({ page }) => {
  await page.goto("/revision");
  await expect(page).toHaveURL(/\/login$/);
  const res = await page.request.get("/api/reports/00000000-0000-0000-0000-000000000000/pdf");
  expect(res.status()).toBe(401);
  const cron = await page.request.get("/api/cron/reminder");
  expect(cron.status()).toBe(401);
});
