import { test, expect } from "@playwright/test";

test("guest selects up to three cards from the full deck and sees a concise result", async ({ page }) => {
  await page.goto("/ai/");

  await expect(page.locator("#tarot-deck-zone")).toBeVisible();
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card")).toHaveCount(78);
  await expect(page.locator("#draw-button")).toBeDisabled();
  await expect(page.locator(".choice-row")).toHaveCount(0);

  const deckCards = page.locator("#tarot-deck-card-list .tarot-deck-card");
  await deckCards.nth(0).click();
  await deckCards.nth(1).click();
  await deckCards.nth(2).click();
  await expect(deckCards.nth(3)).toBeDisabled();

  await expect(page.locator("#selected-cards .selected-card")).toHaveCount(3);
  await expect(page.locator("#selected-count")).toHaveText("3 / 3");
  await expect(page.locator("#draw-button")).toBeEnabled();

  await page.locator("#draw-button").click();
  await expect(page).toHaveURL(/#reading-result$/);
  await expect(page.locator("#reading-result-stage")).toBeVisible();
  await expect(page.locator("#reading-sets .reading-set")).toHaveCount(1);
  await expect(page.locator("#reading-sets .tarot-card-card")).toHaveCount(3);
  await expect(page.locator("#reading-result-title")).toHaveText("ผลการเปิดไพ่");
});
