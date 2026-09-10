import { test, expect } from "@playwright/test";

test("selection tray shows exactly the selected cards and clears after commit", async ({ page }) => {
  await page.goto("/ai/");
  const cards = page.locator("#tarot-deck-card-list .tarot-deck-card");
  await cards.nth(4).click();
  await cards.nth(21).click();
  await expect(page.locator("#selected-card-tray .selected-card-slot")).toHaveCount(2);
  await expect(page.locator("#selected-count")).toHaveText("2");
  await expect(page.locator("#pending-count")).toHaveText("0");
  await page.locator("#draw-button").click();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#selected-card-tray .selected-card-slot")).toHaveCount(0);
  await expect(page.locator("#opened-count")).toHaveText("2");
  await expect(page.locator("#remaining-count")).toHaveText("76");
});

test("the selected deck card is committed exactly once after a draw", async ({ page }) => {
  await page.goto("/ai/");
  await page.locator("#tarot-deck-card-list .tarot-deck-card").first().click();
  await expect(page.locator("#selected-count")).toHaveText("1");
  await page.locator("#draw-button").click();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-used")).toHaveCount(1);
  await expect(page.locator("#opened-count")).toHaveText("1");
  await expect(page.locator("#remaining-count")).toHaveText("77");
});

test("the mobile compose scene stays inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ai/");
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the result ritual stays compact so the card remains the visual focus", async ({ page }) => {
  await page.goto("/ai/");
  await page.locator("#tarot-deck-card-list .tarot-deck-card").first().click();
  await page.locator("#draw-button").click();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  const height = await page.locator("#reader-result-view .witch-scene").evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThan(160);
});

test("the reader chrome stays flat instead of looking like a dashboard card", async ({ page }) => {
  await page.goto("/ai/");
  const style = await page.locator(".ai-topbar").evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      borderTop: computed.borderTopStyle,
      borderRight: computed.borderRightStyle,
      borderBottom: computed.borderBottomStyle,
      borderLeft: computed.borderLeftStyle,
      radius: computed.borderRadius,
      shadow: computed.boxShadow,
      background: computed.backgroundColor,
    };
  });
  expect(style.borderTop).toBe("none");
  expect(style.borderRight).toBe("none");
  expect(style.borderLeft).toBe("none");
  expect(style.radius).toBe("0px");
  expect(style.shadow).toBe("none");
  expect(style.background).toBe("rgba(0, 0, 0, 0)");
});
