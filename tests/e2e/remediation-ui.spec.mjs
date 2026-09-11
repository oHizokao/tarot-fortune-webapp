import { test, expect } from "@playwright/test";

const MOBILE_VIEWPORTS = [360, 390, 430].map((width) => ({ width, height: 844 }));
const CARD_SELECTOR = "#tarot-deck-card-list .tarot-deck-card";

function durationToMilliseconds(value) {
  const normalized = value.trim();
  if (normalized.endsWith("ms")) return Number.parseFloat(normalized);
  if (normalized.endsWith("s")) return Number.parseFloat(normalized) * 1000;
  return Number.NaN;
}

async function resetGuestReader(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto("/ai/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#tarot-deck-zone")).toBeVisible();
  await expect(page.locator(CARD_SELECTOR)).toHaveCount(78);
}

test.describe("CSS/UI remediation", () => {
  test("keeps the full mobile deck and selected-card controls reachable", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile-chromium", "mobile geometry is covered by the mobile project");

    for (const viewport of MOBILE_VIEWPORTS) {
      await resetGuestReader(page, viewport);

      const layout = await page.evaluate((selector) => {
        const cards = [...document.querySelectorAll(selector)].filter((card) => {
          const rect = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
        const shell = document.querySelector("#ai-reader-app").getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          shellLeft: shell.left,
          shellRight: window.innerWidth - shell.right,
          cards: cards.map((card) => {
            const rect = card.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          }),
        };
      }, CARD_SELECTOR);
      expect.soft(layout.documentWidth, `${viewport.width}px document width`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect.soft(layout.shellLeft, `${viewport.width}px left shell gutter`).toBeGreaterThanOrEqual(15.5);
      expect.soft(layout.shellRight, `${viewport.width}px right shell gutter`).toBeGreaterThanOrEqual(15.5);
      expect(layout.cards, `${viewport.width}px visible deck cards`).toHaveLength(78);
      expect.soft(Math.min(...layout.cards.map((card) => card.width)), `${viewport.width}px minimum card width`).toBeGreaterThanOrEqual(44);
      expect.soft(Math.min(...layout.cards.map((card) => card.height)), `${viewport.width}px minimum card height`).toBeGreaterThanOrEqual(44);

      const deckCards = page.locator(CARD_SELECTOR);
      await deckCards.nth(0).click();
      await deckCards.nth(1).click();
      await deckCards.nth(2).click();
      await expect(page.locator(`${CARD_SELECTOR}.is-selected`)).toHaveCount(3);
      await expect(deckCards.nth(0)).not.toBeDisabled();
      await expect(deckCards.nth(1)).not.toBeDisabled();
      await expect(deckCards.nth(2)).not.toBeDisabled();
      await expect(deckCards.nth(3)).toBeDisabled();

      const removeButtons = page.locator(".selected-card-slot__remove:visible");
      await expect(removeButtons).toHaveCount(3);
      const removeBoxes = await removeButtons.evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect.soft(Math.min(...removeBoxes.map((box) => box.width)), `${viewport.width}px minimum remove width`).toBeGreaterThanOrEqual(44);
      expect.soft(Math.min(...removeBoxes.map((box) => box.height)), `${viewport.width}px minimum remove height`).toBeGreaterThanOrEqual(44);

      await page.locator("#draw-button").click();
      await expect(page.locator("#reading-result-stage")).toBeVisible();
      await expect(deckCards.nth(0)).toHaveClass(/is-used/);
      await expect(deckCards.nth(0)).toBeDisabled();
    }
  });

  test("keeps reduced-motion ritual effects present but calm", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile-chromium", "mobile reduced-motion coverage is isolated to one project");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ai/");
    await expect(page.locator("#tarot-deck-zone")).toBeVisible();

    const styles = await page.evaluate(() => {
      const read = (selector, pseudo = undefined) => {
        const computed = getComputedStyle(document.querySelector(selector), pseudo);
        return {
          animationName: computed.animationName,
          animationDuration: computed.animationDuration,
          animationIterationCount: computed.animationIterationCount,
          animationPlayState: computed.animationPlayState,
        };
      };

      return {
        orbit: read("#tarot-deck-card-list", "::before"),
        orbitCenter: read(".tarot-deck-center", "::before"),
        wheel: read(".witch-motion-wheel"),
        wheelInner: read(".witch-motion-wheel", "::before"),
        wheelSpark: read(".witch-motion-wheel__spark"),
        waitingRing: read(".tarot-waiting-ritual__ring"),
        waitingOrbit: read(".tarot-waiting-ritual__ring", "::before"),
        waitingPulse: read(".tarot-waiting-ritual__ring", "::after"),
        waitingDot: read(".tarot-waiting-ritual__ring i"),
      };
    });
    for (const [name, style] of Object.entries(styles)) {
      expect(style.animationName, `${name} animation`).not.toBe("none");
      expect(style.animationIterationCount, `${name} repeats`).toBe("infinite");
      expect(style.animationPlayState, `${name} runs`).toBe("running");
      const durations = style.animationDuration.split(",").map(durationToMilliseconds);
      expect(durations.every((duration) => Number.isFinite(duration) && duration >= 3000), `${name} duration`).toBe(true);
    }
  });

  test("dims selection decoration without dimming the focused question field", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile-chromium", "mobile focus coverage is isolated to one project");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ai/");
    await expect(page.locator("#tarot-deck-zone")).toBeVisible();

    const opacityBefore = await page.locator(".witch-scene--selection").evaluate((element) => getComputedStyle(element).opacity);
    const focused = await page.evaluate(() => {
      const stage = document.querySelector("#question-stage");
      const field = document.querySelector("#ai-question");
      stage.hidden = false;
      field.focus();
      return {
        fieldOpacity: getComputedStyle(field).opacity,
        sceneOpacity: getComputedStyle(document.querySelector(".witch-scene--selection")).opacity,
      };
    });

    expect(Number(focused.sceneOpacity)).toBeLessThan(Number(opacityBefore));
    expect(focused.fieldOpacity).toBe("1");
  });
});
