import { test, expect } from "@playwright/test";

test("a completed draw changes from the compose scene to the result scene", async ({ page }) => {
  await page.goto("/ai/");
  await page.locator('#tarot-deck-card-list .tarot-deck-card[data-deck-index="20"]').click();
  await page.locator("#draw-button").click();

  await expect(page.locator("#reader-compose-view")).toBeHidden();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#reading-result-stage")).toBeVisible();
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-used")).toHaveCount(1);
  await expect(page.locator("#continue-reading-button")).toContainText("จับไพ่ต่อ");
  await page.locator("#continue-reading-button").click();
  await expect(page.locator("#reader-compose-view")).toBeVisible();
  await expect(page.locator("#reader-result-view")).toBeHidden();
});

test("the full deck keeps selection state clear and a drag does not pick a card", async ({ page }) => {
  await page.goto("/ai/");
  const deck = page.locator("#tarot-deck-card-list .tarot-deck-card");
  await deck.nth(0).click();
  await deck.nth(20).click();
  await deck.nth(50).click();
  await expect(page.locator(".tarot-deck-card.is-selected")).toHaveCount(3);
  await expect(page.locator(".tarot-deck-card.is-disabled:not(.is-used)")).toHaveCount(75);

  await deck.nth(20).click();
  await expect(page.locator(".tarot-deck-card.is-selected")).toHaveCount(2);
  await expect(deck.nth(20)).not.toHaveClass(/is-disabled/);

  const box = await deck.nth(30).boundingBox();
  if (!box) throw new Error("deck card did not render");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 110, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".tarot-deck-card.is-selected")).toHaveCount(2);
});

test("browser navigation returns to the correct reader scene without redrawing", async ({ page }) => {
  await page.goto("/ai/");
  await page.locator('#tarot-deck-card-list .tarot-deck-card[data-deck-index="4"]').click();
  await page.locator("#draw-button").click();
  await expect(page).toHaveURL(/#reading-result$/);
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#question-title$/);
  await expect(page.locator("#reader-compose-view")).toBeVisible();
  await expect(page.locator("#reader-result-view")).toBeHidden();
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-used")).toHaveCount(1);
  await page.goForward();
  await expect(page).toHaveURL(/#reading-result$/);
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-used")).toHaveCount(1);
});
