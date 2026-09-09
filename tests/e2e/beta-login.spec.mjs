import { expect, test } from "@playwright/test";

test("Beta Access Code signs in and opens the AI reader", async ({ page }) => {
  let requestBody;
  await page.route("**/api/auth/beta-login", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        csrf_token: "csrf-test-token",
        user: { username: "tester_01", name: "Tester", ai_enabled: true },
      }),
    });
  });

  await page.goto("/login/?next=/ai/");
  await page.locator("#beta-code").fill("TF-TEST-CODE");
  await page.locator("#beta-login-form").getByRole("button", { name: "เข้าใช้งานด้วย Code" }).click();

  expect(requestBody).toEqual({ access_code: "TF-TEST-CODE" });
  await expect(page).toHaveURL(/\/ai\/$/);
});

test("invalid Beta Access Code shows an actionable message", async ({ page }) => {
  await page.route("**/api/auth/beta-login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "BETA_LOGIN_FAILED", request_id: "req-beta-test" }),
    });
  });

  await page.goto("/login/");
  await page.locator("#beta-code").fill("BAD-CODE");
  await page.locator("#beta-login-form").getByRole("button", { name: "เข้าใช้งานด้วย Code" }).click();

  await expect(page.locator("#beta-login-status")).toHaveText("Beta Access Code ไม่ถูกต้องหรือหมดอายุแล้ว");
});
