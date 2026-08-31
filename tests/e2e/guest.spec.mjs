import { test, expect } from "@playwright/test";

test("guest draws without login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
});

test("guest can draw three cards without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /สามใบ/ }).click();
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await expect(page.locator(".result-card")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
