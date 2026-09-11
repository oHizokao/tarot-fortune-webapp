import { test, expect } from "@playwright/test";

test("deck guidance sits above the deck instead of covering cards", async ({ page }) => {
  await page.goto("/ai/");

  await expect(page.locator(".deck-guidance")).toBeVisible();
  await expect(page.locator("#deck-center-title")).toBeVisible();
  await expect(page.locator(".tarot-deck-center strong, .tarot-deck-center small")).toHaveCount(0);

  const geometry = await page.evaluate(() => {
    const guidance = document.querySelector(".deck-guidance")?.getBoundingClientRect();
    const deck = document.querySelector("#tarot-deck-zone")?.getBoundingClientRect();
    return {
      guidanceBottom: guidance?.bottom ?? 0,
      deckTop: deck?.top ?? 0,
    };
  });

  expect(geometry.guidanceBottom).toBeLessThanOrEqual(geometry.deckTop + 1);
});

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

  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-selected")).toHaveCount(3);
  await expect(deckCards.nth(0)).toHaveClass(/is-selected/);
  await expect(deckCards.nth(0)).not.toHaveClass(/is-disabled/);
  await expect(deckCards.nth(3)).toHaveClass(/is-disabled/);
  const selectionStyles = await page.evaluate(() => ({
    selectedBorderWidth: getComputedStyle(document.querySelector(".tarot-deck-card.is-selected .tarot-deck-card__back")).borderTopWidth,
    selectedBorderColor: getComputedStyle(document.querySelector(".tarot-deck-card.is-selected .tarot-deck-card__back")).borderTopColor,
    disabledFilter: getComputedStyle(document.querySelector(".tarot-deck-card.is-disabled")).filter,
  }));
  expect(selectionStyles.selectedBorderWidth).toBe("2px");
  expect(selectionStyles.selectedBorderColor).toBe("rgb(141, 232, 202)");
  expect(selectionStyles.disabledFilter).toContain("grayscale");
  await expect(page.locator("#draw-button")).toBeEnabled();

  await page.locator("#draw-button").click();
  await expect(page).toHaveURL(/#reading-result$/);
  await expect(page.locator("#reading-result-stage")).toBeVisible();
  await expect(page.locator("#reading-sets .reading-set")).toHaveCount(1);
  await expect(page.locator("#reading-sets .tarot-card-card")).toHaveCount(3);
  await expect(page.locator("#reading-result-title")).toHaveText("ผลการเปิดไพ่");
  await expect(deckCards.nth(0)).toHaveClass(/is-used/);
  await expect(deckCards.nth(0)).toBeDisabled();
  await expect(deckCards.nth(1)).toHaveClass(/is-used/);
  await expect(deckCards.nth(2)).toHaveClass(/is-used/);
});
