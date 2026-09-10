import { test, expect } from "@playwright/test";

async function installMemberApi(page) {
  const api = { session: false, rounds: [], nextCard: 1, drawCalls: 0, answerCalls: 0, answerDelay: 0, drawGate: null, releaseDraw: null, answerGate: null, releaseAnswer: null };
  const cardName = (file) => file.includes("002") ? "Acceptance" : file.includes("003") ? "Understanding" : "Relaxation";
  const structuredAnswer = (round) => ({
    verdict: `ฟันธง: คำตอบของคำถาม “${round.question}” คือให้เดินหน้าอย่างชัดเจน`,
    cards: round.cards.map((file, index) => ({
      position: index + 1,
      name: cardName(file),
      meaning: `ไพ่ ${cardName(file)} สะท้อนความหมายที่เกี่ยวข้องกับคำถามนี้โดยตรง`,
      prediction: "สำหรับคำถามนี้ ไพ่ใบนี้ชี้ทิศทางที่ควรเลือกอย่างชัดเจน",
    })),
    overall_prediction: `สรุปคำทำนาย: เรื่อง “${round.question}” มีแนวโน้มไปในทางที่ดีเมื่อคุณเลือกทำสิ่งสำคัญอย่างต่อเนื่อง`,
    safety_note: "",
  });
  const sessionPayload = () => {
    const opened = api.rounds.reduce((total, round) => total + round.cards.length, 0);
    return { id: "session-1", status: "active", deck_ready: true, draw_cursor: opened, opened_count: opened, remaining: 78 - opened, latest_question: api.rounds.at(-1)?.question || "", rounds: api.rounds.map((round) => ({ ...round, cards: [...round.cards] })) };
  };
  const nextCards = (count) => Array.from({ length: count }, () => `card-${String(api.nextCard++).padStart(3, "0")}.webp`);

  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, authenticated: true, csrf_token: "test-csrf", backend_configured: true, user: { username: "tester", name: "ผู้ใช้งาน", ai_enabled: true, must_change_password: false } }),
  }));
  await page.route("**/api/ai/deck-sessions*", async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action") || "";
    const roundId = url.searchParams.get("round_id") || "";
    if (route.request().method() === "POST" && !action) {
      api.session = true;
      api.rounds = [];
      api.nextCard = 1;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), rounds: [], remaining: 78 }) });
      return;
    }
    if (route.request().method() === "GET" && url.searchParams.get("session_id")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload() }) });
      return;
    }
    if (route.request().method() === "DELETE") {
      api.session = false;
      api.rounds = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, deleted: 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sessions: api.session ? [sessionPayload()] : [] }) });
      return;
    }
    if (route.request().method() === "POST" && action === "draw") {
      const body = await route.request().postDataJSON();
      const round = { id: `round-${api.rounds.length + 1}`, round_number: api.rounds.length + 1, question: body.question, cards: nextCards(Number(body.count)), status: "drawn", answer_json: null, answer_text: "" };
      api.rounds.push(round);
      api.drawCalls += 1;
      if (api.drawGate) await api.drawGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round, remaining: sessionPayload().remaining }) });
      return;
    }
    if (route.request().method() === "POST" && action === "answer") {
      const round = api.rounds.find((item) => item.id === roundId);
      const structured = structuredAnswer(round);
      round.answer_json = structured;
      round.answer_text = structured.verdict;
      round.status = "answered";
      api.answerCalls += 1;
      if (api.answerGate) await api.answerGate;
      if (api.answerDelay) await new Promise((resolve) => setTimeout(resolve, api.answerDelay));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round, answer: round.answer_text, structured }) });
      return;
    }
    if (route.request().method() === "POST" && action === "reset") {
      api.session = false;
      api.rounds = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: { ...sessionPayload(), status: "closed" } }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, message: "mock route not found" }) });
  });
  return api;
}

async function selectCards(page, count) {
  const cards = page.locator("#tarot-deck-card-list .tarot-deck-card:not(.is-used)");
  for (let index = 0; index < count; index += 1) await cards.nth(index).click();
}

async function predict(page, count = 1) {
  const continueButton = page.locator("#continue-reading-button");
  if (await continueButton.isVisible()) {
    await expect(continueButton).toBeEnabled({ timeout: 30_000 });
    await continueButton.click();
    await expect(page.locator("#reader-compose-view")).toBeVisible();
  }
  const before = await page.locator(".tarot-card-card").count();
  await selectCards(page, count);
  await page.locator("#draw-button").click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(before + count, { timeout: 10_000 });
}

test("guest sees both modes and opens manual cards from the foyer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#manual-mode-link")).toContainText("เปิดไพ่ด้วยตัวเอง");
  await expect(page.locator("#ai-mode-link")).toContainText("ถามแม่มด AI");
  await page.locator("#manual-mode-link").click();
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
});

test("guest selects up to three cards, predicts, and resets the 78-card deck", async ({ page }) => {
  await page.goto("/ai/");
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card")).toHaveCount(78);
  await expect(page.locator(".choice-row")).toHaveCount(0);
  await expect(page.locator("#draw-button")).toBeDisabled();
  await selectCards(page, 3);
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-selected")).toHaveCount(3);
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card").nth(3)).toBeDisabled();
  await expect(page.locator("#draw-button")).toBeEnabled();
  await page.locator("#draw-button").click();
  await expect(page).toHaveURL(/#reading-result$/);
  await expect(page.locator("#reading-result-stage")).toBeVisible();
  await expect(page.locator("#reading-sets .reading-set")).toHaveCount(1);
  await expect(page.locator("#reading-sets .tarot-card-card")).toHaveCount(3);
  await expect(page.locator("#opened-count")).toHaveText("3");
  await expect(page.locator("#remaining-count")).toHaveText("75");
  await page.locator("#result-reset-button").click();
  await expect(page.locator("#opened-count")).toHaveText("0");
  await expect(page.locator("#remaining-count")).toHaveText("78");
  await expect(page.locator(".tarot-card-card")).toHaveCount(0);
});

test("guest can keep opening separate rounds without repeating cards", async ({ page }) => {
  await page.goto("/ai/");
  await predict(page, 3);
  await expect(page.locator("#reading-sets .reading-set")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-used")).toHaveCount(3);
  await predict(page, 2);
  await expect(page.locator("#reading-sets .reading-set")).toHaveCount(2);
  await expect(page.locator("#reading-sets .tarot-card-card")).toHaveCount(5);
  await expect(page.locator("#remaining-count")).toHaveText("73");
  const sources = await page.locator(".tarot-card-card img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  expect(new Set(sources).size).toBe(5);
});

test("guest result cards keep their complete source ratio and the reader has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ai/");
  await predict(page, 1);
  const image = page.locator(".tarot-card-card img").first();
  await expect(image).toHaveJSProperty("naturalWidth", 448);
  await expect(image).toHaveJSProperty("naturalHeight", 800);
  await page.waitForTimeout(950);
  const metrics = await image.evaluate((element) => ({ objectFit: getComputedStyle(element).objectFit, ratio: element.getBoundingClientRect().width / element.getBoundingClientRect().height }));
  expect(metrics.objectFit).toBe("contain");
  expect(Math.abs(metrics.ratio - (448 / 800))).toBeLessThan(0.08);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("ritual motion stays visible and always on while a guest selects cards", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("tarot-daily-motion-enabled", "off"));
  await page.goto("/ai/");
  const wheel = page.locator(".witch-scene--selection .witch-motion-wheel");
  await expect(wheel).toBeVisible();
  await expect(wheel).toHaveCSS("animation-name", "witchWheelSpin");
  await expect(page.locator("#motion-toggle")).toHaveCount(0);
  await expect(page.locator("#ai-reader-app")).toHaveAttribute("data-motion-enabled", "true");
  const before = await wheel.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(650);
  const after = await wheel.evaluate((element) => getComputedStyle(element).transform);
  expect(after).not.toBe(before);
});

test("member types a question, selects cards, and receives one reading per card plus a summary", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  await page.goto("/ai/");
  await expect(page.locator("#question-stage")).toBeVisible();
  await page.getByLabel("คำถามของคุณ").fill("เรื่องงานครั้งนี้ควรเดินหน้าต่อไหม?");
  await selectCards(page, 2);
  await expect(page.locator("#draw-button")).toBeEnabled();
  await page.locator("#draw-button").click();
  await expect(page).toHaveURL(/#reading-result$/);
  await expect(page.locator("#reading-sets .tarot-card-card")).toHaveCount(2);
  await expect(page.locator("#result-question-context")).toContainText("เรื่องงานครั้งนี้ควรเดินหน้าต่อไหม?");
  await expect(page.locator("#ai-answer .answer-section--verdict .answer-section-heading h3")).toHaveText("ฟันธงคำถามนี้");
  await expect(page.locator("#ai-answer .answer-section--cards .answer-section-heading h3")).toHaveText("อ่านไพ่ทีละใบ");
  await expect(page.locator("#ai-answer .answer-section--overall .answer-section-heading h3")).toHaveText("สรุปคำทำนาย");
  await expect(page.locator("#ai-answer")).not.toContainText("คำทำนายรายใบ");
  await expect(page.locator("#ai-answer .answer-section--card .answer-detail-row").first()).toContainText("แปลความหมาย");
  await expect(page.locator("#ai-answer .answer-section--cards .answer-card")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator("#ai-answer .answer-section--overall")).toContainText("สรุปคำทำนาย");
  await expect(page.locator("#ai-answer")).not.toContainText("คำแนะนำถัดไป");
  await expect(page.locator("#ai-answer")).not.toContainText("คำถามชวนทบทวน");
  expect(api.drawCalls).toBe(1);
  expect(api.answerCalls).toBe(1);
});

test("member marks exactly the sparse cards selected in the deck", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("ไพ่สามใบนี้ตอบคำถามของฉันอย่างไร?");

  const selected = [0, 20, 50];
  for (const index of selected) {
    await page.locator(`#tarot-deck-card-list .tarot-deck-card[data-deck-index="${index}"]`).click();
  }
  await page.locator("#draw-button").click();
  await expect(page.locator("#opened-count")).toHaveText("3");
  await expect(page.locator("#remaining-count")).toHaveText("75");
  await expect.poll(async () => page.locator("#tarot-deck-card-list .tarot-deck-card.is-used").evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.deckIndex)).sort((a, b) => a - b))).toEqual(selected);
  expect(api.drawCalls).toBe(1);
});

test("member keeps the deck count and unused cards visible while AI is answering", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.drawGate = new Promise((resolve) => { api.releaseDraw = resolve; });
  api.answerGate = new Promise((resolve) => { api.releaseAnswer = resolve; });
  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("เรื่องนี้ควรเดินหน้าต่อไหม?");
  await selectCards(page, 1);
  await page.locator("#draw-button").click();
  await expect(page.locator("#deck-center-title")).toHaveText("กำลังสับไพ่…");
  await expect(page.locator("#opened-count")).toHaveText("1");
  await expect(page.locator("#remaining-count")).toHaveText("77");
  api.releaseDraw();
  await expect(page.locator("#tarot-waiting-ritual")).toBeVisible();
  await expect(page.locator("#opened-count")).toHaveText("1");
  await expect(page.locator("#remaining-count")).toHaveText("77");
  await expect(page.locator("#reader-compose-view")).toBeHidden();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#result-status")).toContainText("สำรับเหลือ 77 ใบ");
  api.releaseAnswer();
  await expect(page.locator("#ai-answer .answer-section--overall")).toBeVisible({ timeout: 10_000 });
});

test("member can continue with a new question and the memory keeps both rounds", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("ควรเริ่มจากอะไร?");
  await predict(page, 1);
  await expect(page.locator("#memory-history")).toContainText("1 คำถาม");
  await page.locator("#continue-reading-button").click();
  await expect(page.locator("#reader-compose-view")).toBeVisible();
  await page.getByLabel("คำถามรอบถัดไป").fill("แล้วก้าวต่อไปล่ะ?");
  await predict(page, 2);
  await expect(page.locator(".reading-set")).toHaveCount(2);
  await expect(page.locator("#memory-history")).toContainText("2 คำถาม");
  await expect(page.locator("#memory-history")).toContainText("แล้วก้าวต่อไปล่ะ?");
  expect(api.rounds).toHaveLength(2);
  expect(new Set(api.rounds.flatMap((round) => round.cards)).size).toBe(3);
});

test("member opens old history only when requested and starts with a fresh reading", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.session = true;
  api.rounds = [{ id: "round-history-1", round_number: 1, question: "รอบก่อนควรตัดสินใจอย่างไร?", cards: ["card-001.webp"], status: "answered", answer_json: { verdict: "คำฟันธงจากรอบก่อน", cards: [{ position: 1, name: "Relaxation", meaning: "ความหมายเดิม", prediction: "คำทำนายเดิม" }], overall_prediction: "สรุปคำทำนายจากรอบก่อน" }, answer_text: "คำฟันธงจากรอบก่อน" }];
  await page.goto("/ai/");
  await expect(page.locator("#question-stage")).toBeVisible();
  await expect(page.locator("#reading-result-stage")).toBeHidden();
  await expect(page.locator("#reading-history-panel")).toBeVisible();
  await expect(page.locator("#reading-history-list")).toContainText("รอบก่อนควรตัดสินใจอย่างไร?");
  await page.getByRole("button", { name: /ดูย้อนหลัง/ }).click();
  await expect(page.locator("#ai-answer")).toContainText("คำฟันธงจากรอบก่อน");
  await page.locator("#start-new-reading-button").click();
  await expect(page.locator("#question-stage")).toBeVisible();
  await expect(page.locator("#reading-result-stage")).toBeHidden();
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
});

test("member can delete one saved history item", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.session = true;
  api.rounds = [{ id: "round-delete-1", round_number: 1, question: "รายการที่ต้องลบ", cards: ["card-001.webp"], status: "answered", answer_json: null, answer_text: "" }];
  await page.goto("/ai/");
  await expect(page.locator("#reading-history-panel")).toBeVisible();
  await expect(page.locator(".history-delete-button")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".history-delete-button").click();
  await expect(page.locator("#reading-history-panel")).toBeHidden();
  expect(api.session).toBe(false);
});

test("member can delete all saved history items", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.session = true;
  api.rounds = [{ id: "round-delete-all-1", round_number: 1, question: "รายการทั้งหมด", cards: ["card-002.webp"], status: "answered", answer_json: null, answer_text: "" }];
  await page.goto("/ai/");
  await expect(page.locator("#delete-all-history-button")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-all-history-button").click();
  await expect(page.locator("#reading-history-panel")).toBeHidden();
  expect(api.session).toBe(false);
});

test("mobile reader keeps compose and result scenes in one readable vertical path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ai/");
  const layout = await page.evaluate(() => {
    const boxes = ["#reader-compose-view", ".ai-spread-stage", "#reader-result-view", ".ai-reveal-stage"].map((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, display: getComputedStyle(document.querySelector(selector)).display };
    });
    return {
      composeVisible: !document.querySelector("#reader-compose-view").hidden,
      resultHidden: document.querySelector("#reader-result-view").hidden,
      boxes,
      width: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(layout.composeVisible).toBe(true);
  expect(layout.resultHidden).toBe(true);
  expect(layout.boxes[0].display).not.toBe("none");
  expect(layout.boxes[1].bottom).toBeLessThanOrEqual(layout.boxes[0].bottom);
  expect(layout.width).toBe(true);
});

test("reader stages use a smooth surface instead of nested boxed columns", async ({ page }) => {
  await page.goto("/ai/");
  const stageStyles = await page.evaluate(() => [".ai-spread-stage", ".ai-reveal-stage"].map((selector) => {
    const style = getComputedStyle(document.querySelector(selector));
    return { borderTopStyle: style.borderTopStyle, borderLeftStyle: style.borderLeftStyle, borderRightStyle: style.borderRightStyle, boxShadow: style.boxShadow, radius: style.borderRadius };
  }));
  for (const style of stageStyles) {
    expect(style.borderTopStyle).toBe("none");
    expect(style.borderLeftStyle).toBe("none");
    expect(style.borderRightStyle).toBe("none");
    expect(style.boxShadow).toBe("none");
    expect(style.radius).toBe("0px");
  }
});
