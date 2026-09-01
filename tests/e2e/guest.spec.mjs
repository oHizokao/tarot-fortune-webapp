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
  await expect(page.locator("#spread-kicker")).toHaveText("01 / CHOOSE CARDS");
  await expect(page.locator("#reveal-kicker")).toHaveText("02 / YOUR REVEAL");
  const witchBeforeDraw = await page.locator(".witch-art").boundingBox();
  expect(witchBeforeDraw?.height || 0).toBeLessThan(340);
  const drawButton = page.locator("#draw-button");
  await expect(drawButton).toBeEnabled();
  await drawButton.click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(1);
  await expect(page.locator("#reading-note")).toContainText("อ่านภาพและคำบนไพ่");
});

test("guest can keep opening additional rounds until the deck is exhausted", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/ai/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator('.choice-button[data-count="3"]').click();
  await page.locator("#draw-button").click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(3);
  await expect(page.locator("#remaining-count")).toHaveText("75");
  await expect(page.locator("#draw-button")).toBeEnabled();
  await expect(page.locator("#draw-label")).toContainText("เปิดเพิ่ม");
  await expect(page.locator('.choice-button[data-count="2"]')).toBeEnabled();

  await page.locator('.choice-button[data-count="2"]').click();
  await page.locator("#draw-button").click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(5);
  await expect(page.locator("#opened-count")).toHaveText("5");
  await expect(page.locator("#remaining-count")).toHaveText("73");

  const cardSources = await page.locator(".tarot-card-card img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  expect(new Set(cardSources).size).toBe(5);

  await page.locator('.choice-button[data-count="3"]').click();
  for (let round = 0; round < 25; round += 1) {
    await page.locator("#draw-button").click();
    await expect(page.locator(".tarot-card-card")).toHaveCount(Math.min(78, 5 + ((round + 1) * 3)));
  }
  await expect(page.locator("#remaining-count")).toHaveText("0");
  await expect(page.locator("#draw-button")).toBeDisabled();
  await expect(page.locator("#draw-label")).toContainText("สำรับหมดแล้ว");
  const exhaustedSources = await page.locator(".tarot-card-card img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  expect(new Set(exhaustedSources).size).toBe(78);

  await page.locator("#reset-button").click();
  await expect(page.locator("#remaining-count")).toHaveText("78");
  await expect(page.locator("#opened-count")).toHaveText("0");
  await expect(page.locator(".tarot-card-card")).toHaveCount(0);
});

test("reader stages share a smooth surface instead of separate boxed panels", async ({ page }) => {
  await page.goto("/ai/");
  const stageStyles = await page.evaluate(() => [".ai-spread-stage", ".ai-reveal-stage"].map((selector) => {
    const style = getComputedStyle(document.querySelector(selector));
    return { borderStyle: style.borderStyle, boxShadow: style.boxShadow, radius: style.borderRadius };
  }));

  for (const style of stageStyles) {
    expect(style.borderStyle).toBe("none");
    expect(style.boxShadow).toBe("none");
    expect(style.radius).toBe("0px");
  }
});
