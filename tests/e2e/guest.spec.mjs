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

test("AI reader requires a question before drawing", async ({ page }) => {
  await page.goto("/ai/");
  const drawButton = page.locator("#draw-button");
  await expect(drawButton).toBeDisabled();
  await expect(page.locator("#request-status")).toContainText("พิมพ์คำถามก่อน");
  await page.getByLabel("คำถามของคุณ").fill("วันนี้ควรเริ่มดูแลตัวเองจากตรงไหน?");
  await expect(drawButton).toBeEnabled();
  await drawButton.click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(1);
});
