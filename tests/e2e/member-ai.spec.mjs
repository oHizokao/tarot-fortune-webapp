import { test, expect } from "@playwright/test";

test("approved member asks a follow-up in the same reading", async ({ page }) => {
  test.skip(!process.env.E2E_TEST_USERNAME || !process.env.E2E_TEST_PASSWORD, "member smoke credentials are not configured");
  await page.goto("/login/");
  await page.getByLabel("Username").fill(process.env.E2E_TEST_USERNAME);
  await page.getByLabel("รหัสผ่าน").fill(process.env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "เข้าใช้งาน" }).click();
  await page.goto("/ai/");
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await page.getByLabel("คำถามของคุณ").fill("วันนี้ควรเริ่มดูแลตัวเองจากตรงไหน?");
  await page.getByRole("button", { name: /ถาม AI/ }).click();
  await expect(page.locator("#ai-answer")).not.toBeEmpty();
  await page.getByLabel("คำถามของคุณ").fill("แล้วก้าวเล็กที่สุดคืออะไร?");
  await page.getByRole("button", { name: /ถาม AI/ }).click();
  await expect(page.locator("#memory-title")).toContainText("ถามต่อ");
});
