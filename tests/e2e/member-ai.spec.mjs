import { test, expect } from "@playwright/test";

test("approved member asks a follow-up with a new card spread", async ({ page }) => {
  test.skip(!process.env.E2E_TEST_USERNAME || !process.env.E2E_TEST_PASSWORD, "member smoke credentials are not configured");
  await page.goto("/login/");
  await page.locator("#login-username").fill(process.env.E2E_TEST_USERNAME);
  await page.locator("#login-password").fill(process.env.E2E_TEST_PASSWORD);
  await Promise.all([
    page.waitForURL("**/ai/**"),
    page.getByRole("button", { name: "เข้าใช้งาน" }).click(),
  ]);
  await expect(page.locator("#account-link")).toContainText("oHizokao", { timeout: 10_000 });
  await expect(page.locator("#question-stage")).toBeVisible();
  await expect(page.locator("#reader-result-view")).toBeHidden();
  await expect(page.locator("#reading-result-stage")).toBeHidden();
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
  await page.getByLabel("คำถามของคุณ").fill("วันนี้ควรเริ่มดูแลตัวเองจากตรงไหน?");
  await page.locator("#tarot-deck-card-list .tarot-deck-card:not(.is-used)").first().click();
  await expect(page.locator("#draw-button")).toBeEnabled();
  await page.locator("#draw-button").click();
  await expect(page.locator("#ai-answer")).not.toBeEmpty({ timeout: 30_000 });
  await expect(page.locator("#ai-answer .answer-section--verdict .answer-section-heading h3")).toHaveText("ฟันธงคำถามนี้");
  await page.getByRole("button", { name: /ถามต่อ.*จับไพ่ใหม่/ }).click();
  await page.getByLabel("คำถามของคุณ").fill("แล้วก้าวเล็กที่สุดคืออะไร?");
  await expect(page.locator("#ai-answer")).toBeEmpty();
  await expect(page.getByLabel("คำถามของคุณ")).toHaveValue("แล้วก้าวเล็กที่สุดคืออะไร?");
  await page.locator("#tarot-deck-card-list .tarot-deck-card:not(.is-used)").first().click();
  await page.locator("#draw-button").click();
  await expect(page.locator(".reading-set")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator(".reading-set").first().locator(".tarot-card-card")).toHaveCount(1);
  await expect(page.locator("#memory-title")).toHaveText("Memory พร้อม · เปิดรอบใหม่ได้", { timeout: 30_000 });
  await expect(page.locator("#memory-history")).toContainText("แล้วก้าวเล็กที่สุดคืออะไร?", { timeout: 30_000 });
});
