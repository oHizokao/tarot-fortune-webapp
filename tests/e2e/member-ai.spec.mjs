import { test, expect } from "@playwright/test";

test("approved member asks a follow-up in the same reading", async ({ page }) => {
  test.skip(!process.env.E2E_TEST_USERNAME || !process.env.E2E_TEST_PASSWORD, "member smoke credentials are not configured");
  await page.goto("/login/");
  await page.locator("#login-username").fill(process.env.E2E_TEST_USERNAME);
  await page.locator("#login-password").fill(process.env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "เข้าใช้งาน" }).click();
  await page.goto("/ai/");
  await expect(page.locator("#account-link")).toContainText("oHizokao", { timeout: 10_000 });
  await page.getByLabel("คำถามของคุณ").fill("วันนี้ควรเริ่มดูแลตัวเองจากตรงไหน?");
  await expect(page.locator("#draw-button")).toBeEnabled();
  await page.locator("#draw-button").click();
  await expect(page.locator("#ai-answer")).not.toBeEmpty({ timeout: 30_000 });
  await page.getByLabel("คำถามของคุณ").fill("แล้วก้าวเล็กที่สุดคืออะไร?");
  await page.getByRole("button", { name: /ถามต่อ/ }).click();
  await expect(page.locator("#memory-title")).toContainText("ถามต่อ", { timeout: 30_000 });
});
