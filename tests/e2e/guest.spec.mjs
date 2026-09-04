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
  const minimumWitchHeight = (page.viewportSize()?.width || 0) <= 650 ? 230 : 320;
  expect(witchBeforeDraw?.height || 0).toBeGreaterThanOrEqual(minimumWitchHeight);
  const drawButton = page.locator("#draw-button");
  await expect(drawButton).toBeEnabled();
  await drawButton.click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(1);
  await expect(page.locator("#reading-note")).toContainText("อ่านภาพและคำบนไพ่");
  const readingSetStyle = await page.locator(".reading-set").evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderTopStyle: style.borderTopStyle, borderRightStyle: style.borderRightStyle, borderBottomStyle: style.borderBottomStyle, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
  });
  expect(readingSetStyle.borderTopStyle).toBe("none");
  expect(readingSetStyle.borderRightStyle).toBe("none");
  expect(readingSetStyle.borderBottomStyle).toBe("none");
  expect(readingSetStyle.borderRadius).toBe("0px");
  expect(readingSetStyle.boxShadow).toBe("none");
});

test("witch ritual wheel is visible and continuously animates", async ({ page }) => {
  await page.goto("/ai/");
  const wheel = page.locator(".witch-motion-wheel");
  await expect(wheel).toBeVisible();
  await expect(wheel).toHaveCSS("animation-name", "witchWheelSpin");
  const before = await wheel.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(650);
  const after = await wheel.evaluate((element) => getComputedStyle(element).transform);
  expect(after).not.toBe(before);
});

test("ritual motion is always on without a toggle", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("tarot-daily-motion-enabled", "off"));
  await page.goto("/ai/");
  const wheel = page.locator(".witch-motion-wheel");
  await expect(page.locator("#motion-toggle")).toHaveCount(0);
  await expect(page.locator(".motion-control")).toHaveCount(0);
  await expect(page.locator("#ai-reader-app")).toHaveAttribute("data-motion-enabled", "true");
  await expect(wheel).toHaveCSS("animation-name", "witchWheelSpin");
  const before = await wheel.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(650);
  const after = await wheel.evaluate((element) => getComputedStyle(element).transform);
  expect(after).not.toBe(before);
});

test("member AI flow keeps the question, draw, and answer steps obvious", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, authenticated: true, csrf_token: "test-csrf", backend_configured: true, user: { username: "tester", name: "ผู้ใช้งาน", ai_enabled: true, must_change_password: false } }),
  }));
  await page.route("**/api/ai/readings", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, reading: { id: "reading-test-1", cards: ["card-001.webp"], messages: [] } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, readings: [] }) });
  });
  await page.route("**/api/ai/tarot-chat*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, cards: [{ file: "card-001.webp", name: "Relaxation", keywords: ["relaxation"] }], answer: "1) **อ่านคำบนไพ่ที่เกี่ยวข้อง**\n- **Relaxation** — พักใจและคืนสมดุล\n\n2) **เชื่อมกับคำถาม**\nคำนี้ชวนให้คุณเริ่มจากการลดสิ่งรบกวน แล้วค่อยเลือกก้าวที่ทำได้จริง\n\n3) **สรุปคำตอบ**\nคำตอบของไพ่คือให้พักอย่างมีสติ ก่อนจัดลำดับสิ่งสำคัญของวันนี้\n\n4) **คำแนะนำถัดไป**\nเลือกเวลาสั้น ๆ เพื่อพักและเริ่มงานทีละอย่าง", reading: { id: "reading-test-1", cards: ["card-001.webp"], messages: [{ role: "user", content: "วันนี้ควรเริ่มจากตรงไหน?" }, { role: "assistant", content: "1) **อ่านคำบนไพ่ที่เกี่ยวข้อง**\n- **Relaxation** — พักใจและคืนสมดุล\n\n2) **เชื่อมกับคำถาม**\nคำนี้ชวนให้คุณเริ่มจากการลดสิ่งรบกวน แล้วค่อยเลือกก้าวที่ทำได้จริง\n\n3) **สรุปคำตอบ**\nคำตอบของไพ่คือให้พักอย่างมีสติ ก่อนจัดลำดับสิ่งสำคัญของวันนี้\n\n4) **คำแนะนำถัดไป**\nเลือกเวลาสั้น ๆ เพื่อพักและเริ่มงานทีละอย่าง" }] } }),
  }));

  await page.goto("/ai/");
  await expect(page.locator("#question-stage")).toBeVisible();
  await expect(page.locator("#draw-label")).toHaveText("เปิดไพ่");
  await page.getByLabel("คำถามของคุณ").fill("วันนี้ควรเริ่มจากตรงไหน?");
  await expect(page.locator("#draw-button")).toBeEnabled();
  const drawAlignment = await page.locator("#draw-button").evaluate((button) => {
    const action = button.closest(".spread-actions");
    const buttonBox = button.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    return Math.abs((buttonBox.left + buttonBox.width / 2) - (actionBox.left + actionBox.width / 2));
  });
  expect(drawAlignment).toBeLessThan(2);
  await page.locator("#draw-button").click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(1);
  await expect(page.locator("#ai-answer")).toContainText("สรุปคำตอบ", { timeout: 5_000 });
  await expect(page.locator("#draw-label")).toHaveText("เปิดไพ่");
  await expect(page.locator("#ai-answer .answer-section--cards")).toHaveCount(1);
  await expect(page.locator("#ai-answer .answer-card")).toHaveCount(1);
  await expect(page.locator("#ai-answer .answer-card")).toContainText("Relaxation");
  await expect(page.locator("#ai-answer .answer-section[data-answer-key='connection']")).toContainText("คำทำนาย");
  await expect(page.locator("#ai-answer .answer-section[data-answer-key='connection']")).not.toContainText("เชื่อมโยงกับคำถาม");
  await expect(page.locator("#ai-answer .answer-section[data-answer-key='summary']")).toContainText("สรุปคำตอบ");
  await expect(page.locator("#ai-answer .answer-section--next")).toHaveCount(0);
  await expect(page.locator("#ai-answer")).not.toContainText("คำแนะนำถัดไป");
  await expect(page.locator("#ai-answer")).not.toContainText("**");
  await expect(page.locator("#flow-step-answer")).toHaveClass(/is-complete/);
});

test("member AI answer separates every card from its interpretation and summary", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, authenticated: true, csrf_token: "test-csrf", backend_configured: true, user: { username: "tester", name: "ผู้ใช้งาน", ai_enabled: true, must_change_password: false } }),
  }));
  await page.route("**/api/ai/readings", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, reading: { id: "reading-test-2", cards: ["card-001.webp", "card-002.webp"], messages: [] } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, readings: [] }) });
  });
  await page.route("**/api/ai/tarot-chat*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      cards: [
        { file: "card-001.webp", name: "Relaxation", keywords: ["relaxation"] },
        { file: "card-002.webp", name: "Acceptance", keywords: ["acceptance"] },
      ],
      answer: "ไพ่ใบที่ 1 — Relaxation\nความหมายของไพ่: ให้พื้นที่ใจได้พักและคืนสมดุล\nคำทำนาย: เริ่มจากลดสิ่งที่กดดัน แล้วค่อยจัดการเรื่องสำคัญ\nไพ่ใบที่ 2 — Acceptance\nความหมายของไพ่: ยอมรับสิ่งที่เกิดขึ้นโดยไม่ต้องโทษตัวเอง\nคำทำนาย: มองสถานการณ์ตามจริงเพื่อเลือกทางที่เหมาะกับคุณ\nสรุปคำตอบ: คำตอบของไพ่ทั้งสองใบคือพักให้พอ ยอมรับจุดเริ่มต้น และค่อยขยับทีละก้าว\nคำแนะนำถัดไป: เลือกหนึ่งเรื่องที่ทำได้ภายในวันนี้",
      reading: { id: "reading-test-2", cards: ["card-001.webp", "card-002.webp"], messages: [{ role: "user", content: "ฉันควรเริ่มต้นใหม่อย่างไร?" }] },
    }),
  }));

  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("ฉันควรเริ่มต้นใหม่อย่างไร?");
  await page.locator('.choice-button[data-count="2"]').click();
  await page.locator("#draw-button").click();
  await expect(page.locator("#ai-answer .answer-section--cards .answer-card")).toHaveCount(2, { timeout: 5_000 });
  await expect(page.locator("#ai-answer .answer-section--card")).toHaveCount(2);
  await expect(page.locator("#ai-answer .answer-section--card").nth(0)).toContainText("Relaxation");
  await expect(page.locator("#ai-answer .answer-section--card").nth(1)).toContainText("Acceptance");
  await expect(page.locator("#ai-answer .answer-section--summary")).toContainText("พักให้พอ");
  await expect(page.locator("#ai-answer .answer-section--next")).toHaveCount(0);
  await expect(page.locator("#ai-answer")).not.toContainText("คำแนะนำถัดไป");
  await expect(page.locator("#ai-answer")).not.toContainText("**");
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
  await expect(page.locator("#draw-label")).toHaveText("เปิดไพ่");
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

test("desktop reader follows one sequential guest reading rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ai/");

  const layout = await page.evaluate(() => {
    const stage = getComputedStyle(document.querySelector(".ai-reading-stage"));
    return {
      areas: stage.gridTemplateAreas,
      columns: stage.gridTemplateColumns,
    };
  });

  expect(layout.areas).toBe('"flow" "spread" "reveal"');
  expect(layout.columns.split(" ")).toHaveLength(1);
});

test("mobile reader follows one clear vertical path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ai/");

  const layout = await page.evaluate(() => {
    const stage = getComputedStyle(document.querySelector(".ai-reading-stage"));
    const boxes = [".flow-steps", ".ai-spread-stage", ".ai-reveal-stage"].map((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    return { areas: stage.gridTemplateAreas, boxes };
  });

  expect(layout.areas).toBe('"flow" "spread" "reveal"');
  expect(layout.boxes[0].bottom).toBeLessThanOrEqual(layout.boxes[1].top);
  expect(layout.boxes[1].bottom).toBeLessThanOrEqual(layout.boxes[2].top);
});

test("desktop gives the card reveal room and keeps the waiting art visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ai/");

  const metrics = await page.evaluate(() => ({
    spreadWidth: document.querySelector(".ai-spread-stage").getBoundingClientRect().width,
    witchHeight: document.querySelector(".witch-scene").getBoundingClientRect().height,
    emptyHeight: document.querySelector(".empty-card").getBoundingClientRect().height,
  }));

  expect(metrics.spreadWidth).toBeGreaterThanOrEqual(900);
  expect(metrics.witchHeight).toBeGreaterThanOrEqual(320);
  expect(metrics.emptyHeight).toBeLessThanOrEqual(240);
});

test("AI reader shows a guest card at its complete source ratio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ai/");
  await page.locator("#draw-button").click();
  const image = page.locator(".tarot-card-card img").first();
  await expect(image).toHaveJSProperty("naturalWidth", 448);
  await expect(image).toHaveJSProperty("naturalHeight", 800);
  await page.waitForTimeout(950);
  const metrics = await image.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { objectFit: getComputedStyle(element).objectFit, ratio: rect.width / rect.height };
  });
  expect(metrics.objectFit).toBe("contain");
  expect(Math.abs(metrics.ratio - (448 / 800))).toBeLessThan(0.08);
});

test("guest keeps each opening in its own reading set", async ({ page }) => {
  await page.goto("/ai/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator('.choice-button[data-count="3"]').click();
  await page.locator("#draw-button").click();
  await expect(page.locator(".reading-set")).toHaveCount(1);
  await expect(page.locator('.reading-set[data-card-count="3"] .tarot-card-card')).toHaveCount(3);

  await page.locator('.choice-button[data-count="2"]').click();
  await page.locator("#draw-button").click();

  await expect(page.locator(".tarot-card-card")).toHaveCount(5);
  await expect(page.locator(".reading-set")).toHaveCount(2);
  const sets = await page.locator(".reading-set").evaluateAll((elements) => elements.map((element) => ({
    setNumber: element.querySelector(".reading-set-title strong")?.textContent,
    cardCount: element.dataset.cardCount,
    cards: element.querySelectorAll(".tarot-card-card").length,
  })));
  expect(sets).toEqual([
    { setNumber: "ชุดที่ 2", cardCount: "2", cards: 2 },
    { setNumber: "ชุดที่ 1", cardCount: "3", cards: 3 },
  ]);

  await page.locator('.choice-button[data-count="3"]').click();
  await page.locator("#draw-button").click();
  await page.locator("#draw-button").click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(11);
  await expect(page.locator(".reading-set")).toHaveCount(4);
  const loadingModes = await page.locator(".tarot-card-card img").evaluateAll((images) => images.map((image) => image.loading));
  expect(loadingModes.slice(0, 6)).toEqual(["eager", "eager", "eager", "eager", "eager", "eager"]);
  expect(loadingModes.slice(6)).toEqual(["lazy", "lazy", "lazy", "lazy", "lazy"]);
});

test("mobile member reader keeps each stage in its own lane", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ai/");

  const layout = await page.evaluate(() => {
    document.querySelector("#ai-reader-app").dataset.readerMode = "member";
    return [".ai-question-stage", ".ai-spread-stage", ".ai-reveal-stage", ".ai-answer-stage"].map((selector) => getComputedStyle(document.querySelector(selector)).gridArea);
  });

  expect(layout).toEqual(["question", "spread", "reveal", "answer"]);
});
