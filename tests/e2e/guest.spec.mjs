import { test, expect } from "@playwright/test";

test("guest sees both modes and opens manual cards from the foyer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#manual-mode-link")).toContainText("เปิดไพ่ด้วยตัวเอง");
  await expect(page.locator("#ai-mode-link")).toContainText("ถามแม่มด AI");
  await page.locator("#manual-mode-link").click();
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

test("guest can reset the manual deck back to 78 cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /สามใบ/ }).click();
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await expect(page.locator("#remaining-count")).toHaveText("75");
  await page.getByRole("button", { name: "ล้างคำทำนาย" }).click();
  await expect(page.locator("#remaining-count")).toHaveText("78");
  await expect(page.locator(".result-card")).toHaveCount(0);
});

test("guest can open cards on the AI reader without a question", async ({ page }) => {
  await page.goto("/ai/");
  await expect(page.locator("#guest-mode-banner")).toBeVisible();
  await expect(page.locator("#question-stage")).toBeHidden();
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
  await expect(page.locator("#flow-number-spread")).toHaveText("01");
  await expect(page.locator("#flow-number-draw")).toHaveText("02");
  const witchBeforeDraw = await page.locator(".witch-art").boundingBox();
  expect(witchBeforeDraw?.height || 0).toBeLessThan(340);
  const drawButton = page.locator("#draw-button");
  await expect(drawButton).toBeEnabled();
  await drawButton.click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(1);
  await expect(page.locator("#reading-note")).toContainText("อ่านภาพและคำบนไพ่");
});
