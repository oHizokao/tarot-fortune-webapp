import { test, expect } from "@playwright/test";

async function installMemberApi(page) {
  const api = { session: false, rounds: [], nextCard: 1, drawCalls: 0, answerCalls: 0, questions: [], answerDelay: 0 };
  const cardName = (file) => file.includes("002") ? "Acceptance" : file.includes("003") ? "Understanding" : "Relaxation";
  const structuredAnswer = (round) => ({
    verdict: `ฟันธง: คำตอบของคำถาม “${round.question}” คือให้เดินหน้ากับเรื่องนี้อย่างชัดเจน`,
    cards: round.cards.map((file, index) => ({
      position: index + 1,
      name: cardName(file),
      meaning: `ไพ่ ${cardName(file)} สะท้อนความหมายที่เกี่ยวข้องกับคำถามนี้โดยตรง`,
      prediction: "สำหรับคำถามนี้ ไพ่ใบนี้ชี้ให้เห็นทิศทางที่ควรเลือกอย่างชัดเจน",
    })),
    overall_prediction: `สรุปคำทำนาย: เรื่อง “${round.question}” มีแนวโน้มไปในทางที่ดีเมื่อคุณเลือกทำสิ่งสำคัญอย่างต่อเนื่อง`,
    safety_note: "",
  });
  const sessionPayload = () => {
    const opened = api.rounds.reduce((total, round) => total + round.cards.length, 0);
    return { id: "session-1", status: "active", deck_ready: true, draw_cursor: opened, opened_count: opened, remaining: 78 - opened, rounds: api.rounds.map((round) => ({ ...round, cards: [...round.cards] })) };
  };
  const historyPayload = () => ({ ...sessionPayload(), latest_question: api.rounds.at(-1)?.question || "" });
  const nextCards = (count) => Array.from({ length: count }, () => `card-${String(api.nextCard++).padStart(3, "0")}.webp`);

  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, authenticated: true, csrf_token: "test-csrf", backend_configured: true, user: { username: "tester", name: "ผู้ใช้งาน", ai_enabled: true, must_change_password: false } }),
  }));
  await page.route("**/api/ai/deck-sessions*", async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action") || "";
    const sessionId = url.searchParams.get("session_id") || "";
    const roundId = url.searchParams.get("round_id") || "";
    if (route.request().method() === "POST" && !action) {
      api.session = true;
      api.rounds = [];
      api.nextCard = 1;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), rounds: [], remaining: 78 }) });
      return;
    }
    if (route.request().method() === "GET" && sessionId) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload() }) });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sessions: api.session ? [historyPayload()] : [] }) });
      return;
    }
    if (route.request().method() === "POST" && action === "draw") {
      const body = await route.request().postDataJSON();
      const round = { id: `round-${api.rounds.length + 1}`, round_number: api.rounds.length + 1, question: body.question, cards: nextCards(Number(body.count)), status: "drawn", answer_json: null, answer_text: "" };
      api.rounds.push(round);
      api.questions.push(body.question);
      api.drawCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round, remaining: sessionPayload().remaining }) });
      return;
    }
    if (route.request().method() === "POST" && action === "answer") {
      const round = api.rounds.find((item) => item.id === roundId);
      if (api.answerDelay) await new Promise((resolve) => setTimeout(resolve, api.answerDelay));
      const structured = structuredAnswer(round);
      round.answer_json = structured;
      round.answer_text = structured.verdict;
      round.status = "answered";
      api.answerCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round, answer: round.answer_text, structured }) });
      return;
    }
    if (route.request().method() === "POST" && action === "reset") {
      api.session = false;
      api.rounds = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: { ...sessionPayload(), status: "closed", remaining: 0 } }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, message: "mock route not found" }) });
  });
  return api;
}

function structuredAnswerForTest() {
  return {
    verdict: "คำฟันธงจากรอบก่อน",
    cards: [{ position: 1, name: "Relaxation", meaning: "ความหมายเดิม", prediction: "คำทำนายเดิม" }],
    overall_prediction: "สรุปคำทำนายจากรอบก่อน",
    safety_note: "",
  };
}

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
  await expect(page.locator("#reveal-kicker")).toHaveText("02 / THE REVEAL");
  const witchBeforeDraw = await page.locator(".witch-art").boundingBox();
  const minimumWitchHeight = (page.viewportSize()?.width || 0) <= 650 ? 175 : 240;
  expect(witchBeforeDraw?.height || 0).toBeGreaterThanOrEqual(minimumWitchHeight);
  const drawButton = page.locator("#draw-button");
  await expect(drawButton).toBeEnabled();
  await drawButton.click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(1);
  await expect(page.locator("#reading-note")).toContainText("เปิดแล้ว 1 ชุด");
  const readingSetStyle = await page.locator(".reading-set").evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderTopStyle: style.borderTopStyle, borderRightStyle: style.borderRightStyle, borderBottomStyle: style.borderBottomStyle, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
  });
  expect(readingSetStyle.borderTopStyle).toBe("none");
  expect(readingSetStyle.borderRightStyle).toBe("none");
  expect(readingSetStyle.borderBottomStyle).toBe("solid");
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
  await installMemberApi(page);
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
    body: JSON.stringify({ ok: true, cards: [{ file: "card-001.webp", name: "Relaxation", keywords: ["relaxation"] }], answer: "1) **อ่านคำบนไพ่ที่เกี่ยวข้อง**\n- **Relaxation** — พักใจและคืนสมดุล\n\n2) **เชื่อมกับคำถาม**\nคำนี้ชวนให้คุณเริ่มจากการลดสิ่งรบกวน แล้วค่อยเลือกก้าวที่ทำได้จริง\n\n3) **สรุปคำตอบ**\nคำตอบของไพ่คือให้พักอย่างมีสติ ก่อนจัดลำดับสิ่งสำคัญของวันนี้\n\n4) **คำแนะนำถัดไป**\nเลือกเวลาสั้น ๆ เพื่อพักและเริ่มงานทีละอย่าง\n\n5) **คำถามชวนทบทวน**\nลองถามตัวเองว่าอะไรจะทำให้วันนี้เบาลง", reading: { id: "reading-test-1", cards: ["card-001.webp"], messages: [{ role: "user", content: "วันนี้ควรเริ่มจากตรงไหน?" }, { role: "assistant", content: "1) **อ่านคำบนไพ่ที่เกี่ยวข้อง**\n- **Relaxation** — พักใจและคืนสมดุล\n\n2) **เชื่อมกับคำถาม**\nคำนี้ชวนให้คุณเริ่มจากการลดสิ่งรบกวน แล้วค่อยเลือกก้าวที่ทำได้จริง\n\n3) **สรุปคำตอบ**\nคำตอบของไพ่คือให้พักอย่างมีสติ ก่อนจัดลำดับสิ่งสำคัญของวันนี้\n\n4) **คำแนะนำถัดไป**\nเลือกเวลาสั้น ๆ เพื่อพักและเริ่มงานทีละอย่าง\n\n5) **คำถามชวนทบทวน**\nลองถามตัวเองว่าอะไรจะทำให้วันนี้เบาลง" }] } }),
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
  await expect(page.locator("#ai-answer")).toContainText("สรุปคำทำนาย", { timeout: 5_000 });
  await expect(page.locator("#draw-label")).toHaveText("เปิดไพ่");
  await expect(page.locator("#ai-answer .answer-section--cards")).toHaveCount(1);
  await expect(page.locator("#ai-answer .answer-card")).toHaveCount(1);
  await expect(page.locator("#ai-answer .answer-card")).toContainText("Relaxation");
  await expect(page.locator("#ai-answer .answer-section[data-answer-key='cards']")).toContainText("คำทำนาย");
  await expect(page.locator("#ai-answer .answer-section[data-answer-key='cards']")).not.toContainText("เชื่อมโยงกับคำถาม");
  await expect(page.locator("#ai-answer .answer-section[data-answer-key='overall']")).toContainText("สรุปคำทำนาย");
  await expect(page.locator("#ai-answer .answer-section--next")).toHaveCount(0);
  await expect(page.locator("#ai-answer")).not.toContainText("คำแนะนำถัดไป");
  await expect(page.locator("#ai-answer .answer-section--reflection")).toHaveCount(0);
  await expect(page.locator("#ai-answer")).not.toContainText("คำถามชวนทบทวน");
  await expect(page.locator("#ai-answer")).not.toContainText("**");
  await expect(page.locator("#flow-step-answer")).toHaveClass(/is-complete/);
  await expect(page.locator("#question-title")).toHaveText("ถามคำถามใหม่");
  await expect(page.locator("#ai-question")).toHaveValue("");
  await page.getByLabel("คำถามรอบถัดไป").fill("วันนี้ควรจัดการเรื่องไหนก่อน?");
  await expect(page.locator("#draw-button")).toBeEnabled();
});

test("member keeps opened cards visible behind a clear ritual while AI is answering", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.answerDelay = 900;

  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("เรื่องงานของฉันควรเดินหน้าต่ออย่างไร?");
  await page.locator("#draw-button").click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator("#tarot-waiting-ritual")).toBeVisible();
  await expect(page.locator("#tarot-waiting-ritual .tarot-waiting-ritual__ring")).toHaveCSS("animation-name", "tarotWaitingSpin");
  await expect(page.locator("#tarot-waiting-ritual")).toContainText("กำลังอ่านคำบนไพ่");
  await expect(page.locator("#tarot-waiting-ritual")).toContainText("กำลังเชื่อมโยงกับคำถามของคุณ");
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
  await expect(page.locator("#tarot-waiting-ritual")).toBeHidden({ timeout: 5_000 });
  await expect(page.locator("#ai-answer")).toContainText("สรุปคำทำนาย", { timeout: 5_000 });
});

test("member can ask a follow-up and keep the saved conversation in selectable history", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("qa-memory-started")) {
      localStorage.clear();
      sessionStorage.setItem("qa-memory-started", "1");
    }
  });
  const api = await installMemberApi(page);
  let savedCards = [];
  let activeReading = null;
  const createBodies = [];
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, authenticated: true, csrf_token: "test-csrf", backend_configured: true, user: { username: "tester", name: "ผู้ใช้งาน", ai_enabled: true, must_change_password: false } }),
  }));
  await page.route("**/api/ai/readings", async (route) => {
    if (route.request().method() === "POST") {
      const body = await route.request().postDataJSON();
      createBodies.push(body);
      savedCards = body.cards;
      activeReading = { id: `reading-follow-up-${createBodies.length}`, cards: savedCards, status: "active", messages: activeReading?.messages || [] };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, reading: activeReading }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, readings: activeReading ? [activeReading] : [] }) });
  });
  let chatCalls = 0;
  const postedQuestions = [];
  await page.route("**/api/ai/tarot-chat*", async (route) => {
    if (route.request().method() === "GET") {
      const cards = savedCards.map((file, index) => ({ file, name: index ? "Understanding" : "Relaxation", keywords: [index ? "understanding" : "relaxation"] }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, cards, reading: activeReading }) });
      return;
    }
    chatCalls += 1;
    const body = await route.request().postDataJSON();
    postedQuestions.push({ readingId: new URL(route.request().url()).searchParams.get("reading_id"), question: body.question });
    const cards = savedCards.map((file, index) => ({ file, name: index ? "Understanding" : "Relaxation", keywords: [index ? "understanding" : "relaxation"] }));
    const answer = cards.map((card, index) => `ไพ่ใบที่ ${index + 1} — ${card.name}\nความหมายของไพ่: อ่านคำบนไพ่ตามบริบท\nคำทำนาย: เชื่อมกับคำถามปัจจุบันโดยตรง`).join("\n") + "\nสรุปคำตอบ: เลือกคำตอบที่ตรงกับเรื่องที่คุณกำลังถามอยู่";
    const previousMessages = activeReading?.messages || [];
    const messages = [...previousMessages, { role: "user", content: body.question }, { role: "assistant", content: answer }];
    activeReading = { ...activeReading, cards: savedCards, messages };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, cards, answer, reading: activeReading }) });
  });

  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("เริ่มจากอะไร?");
  await page.locator("#draw-button").click();
  await expect(page.locator("#ai-answer")).toContainText("สรุปคำทำนาย", { timeout: 5_000 });
  await expect(page.locator("#memory-history")).toContainText("1 คำถาม");
  await expect(page.getByLabel("คำถามรอบถัดไป")).toHaveValue("");
  await page.getByLabel("คำถามรอบถัดไป").fill("แล้วก้าวต่อไปล่ะ?");
  await expect(page.locator("#draw-button")).toBeEnabled();
  await page.locator('.choice-button[data-count="2"]').click();
  await page.locator("#draw-button").click();
  await expect(page.locator(".reading-set")).toHaveCount(2);
  await expect(page.locator(".reading-set").first().locator(".tarot-card-card")).toHaveCount(2);
  await expect(page.locator("#ai-answer")).toContainText("สรุปคำทำนาย", { timeout: 5_000 });
  await expect(page.locator("#memory-history")).toContainText("2 คำถาม", { timeout: 5_000 });
  await expect(page.locator("#memory-history")).toContainText("แล้วก้าวต่อไปล่ะ?");
  expect(api.answerCalls).toBe(2);
  expect(api.drawCalls).toBe(2);
  expect(api.rounds).toHaveLength(2);
  expect(api.rounds[1].cards).toHaveLength(2);
  expect(new Set(api.rounds.flatMap((round) => round.cards)).size).toBe(3);
  await page.reload();
  await expect(page.locator("#question-stage")).toBeVisible();
  await expect(page.locator("#reading-sets .empty-card")).toBeVisible();
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
  await expect(page.locator("#reading-history-panel")).toBeVisible();
  await expect(page.locator("#reading-history-list")).toContainText("แล้วก้าวต่อไปล่ะ?");
  await page.getByRole("button", { name: /ดูย้อนหลัง/ }).click();
  await expect(page.locator("#memory-history")).toContainText("2 คำถาม", { timeout: 5_000 });
  await expect(page.locator("#memory-history")).toContainText("แล้วก้าวต่อไปล่ะ?");
  await expect(page.locator(".reading-set").first().locator(".tarot-card-card")).toHaveCount(2);
});

test("member starts with a fresh reading while older sessions remain selectable", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.session = true;
  api.rounds = [{
    id: "round-history-1",
    round_number: 1,
    question: "รอบก่อนควรตัดสินใจอย่างไร?",
    cards: ["card-001.webp"],
    status: "answered",
    answer_json: structuredAnswerForTest(),
    answer_text: "คำฟันธงจากรอบก่อน",
  }];

  await page.goto("/ai/");
  await expect(page.locator("#question-stage")).toBeVisible();
  await expect(page.locator("#reading-sets .empty-card")).toBeVisible();
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
  await expect(page.locator("#reading-history-panel")).toBeVisible();
  await expect(page.locator("#reading-history-list")).toContainText("รอบก่อนควรตัดสินใจอย่างไร?");

  await page.getByRole("button", { name: /ดูย้อนหลัง/ }).click();
  await expect(page.locator("#ai-answer-stage")).toBeVisible();
  await expect(page.locator("#ai-answer")).toContainText("คำฟันธงจากรอบก่อน");
  await expect(page.locator("#start-new-reading-button")).toBeVisible();

  await page.locator("#start-new-reading-button").click();
  await expect(page.locator("#question-stage")).toBeVisible();
  await expect(page.locator("#reading-sets .empty-card")).toBeVisible();
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
});

test("card count choices are easy to tap on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ai/");
  const desktopMetrics = await page.locator('.choice-button[data-count="1"]').evaluate((button) => ({
    height: button.getBoundingClientRect().height,
    fontSize: getComputedStyle(button.querySelector("b")).fontSize,
  }));
  expect(desktopMetrics.height).toBeGreaterThanOrEqual(154);
  expect(Number.parseFloat(desktopMetrics.fontSize)).toBeGreaterThanOrEqual(30);
  expect(await page.locator(".choice-visual").count()).toBe(3);
  expect(await page.locator('.choice-button[data-count="1"]').innerText()).toContain("จับไพ่ 1 ใบ");
  const desktopActions = await page.locator(".spread-actions").evaluate((actions) => ({
    drawHeight: actions.querySelector("#draw-button")?.getBoundingClientRect().height || 0,
    resetHeight: actions.querySelector("#reset-button")?.getBoundingClientRect().height || 0,
  }));
  expect(desktopActions.drawHeight).toBeGreaterThanOrEqual(68);
  expect(desktopActions.resetHeight).toBeGreaterThanOrEqual(48);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileMetrics = await page.locator('.choice-button[data-count="1"]').evaluate((button) => {
    const row = button.closest(".choice-row");
    return { height: button.getBoundingClientRect().height, columnCount: getComputedStyle(row).gridTemplateColumns.split(" ").length };
  });
  expect(mobileMetrics.height).toBeGreaterThanOrEqual(112);
  expect(mobileMetrics.columnCount).toBe(1);
  const mobileActions = await page.locator(".spread-actions").evaluate((actions) => ({
    drawHeight: actions.querySelector("#draw-button")?.getBoundingClientRect().height || 0,
    resetHeight: actions.querySelector("#reset-button")?.getBoundingClientRect().height || 0,
  }));
  expect(mobileActions.drawHeight).toBeGreaterThanOrEqual(64);
  expect(mobileActions.resetHeight).toBeGreaterThanOrEqual(50);
});

test("member AI answer separates every card from its interpretation and summary", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await installMemberApi(page);
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
  const answerLayout = await page.locator("#ai-answer .answer-card-list").evaluate((list) => {
    const card = list.querySelector(".answer-section--card");
    return {
      columns: getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length,
      cardDisplay: card ? getComputedStyle(card).display : "",
      detailDisplay: card ? getComputedStyle(card.querySelector(".answer-detail-row")).display : "",
    };
  });
  expect(answerLayout.columns, JSON.stringify(answerLayout)).toBe(1);
  expect(answerLayout.cardDisplay, JSON.stringify(answerLayout)).toBe("block");
  expect(answerLayout.detailDisplay, JSON.stringify(answerLayout)).toBe("block");
  await expect(page.locator("#ai-answer .answer-section--card").nth(0)).toContainText("Relaxation");
  await expect(page.locator("#ai-answer .answer-section--card").nth(1)).toContainText("Acceptance");
  await expect(page.locator("#ai-answer .answer-section--overall")).toContainText("สรุปคำทำนาย");
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
  for (let round = 0; round < 24; round += 1) {
    await page.locator("#draw-button").click();
    await expect(page.locator(".tarot-card-card")).toHaveCount(Math.min(78, 5 + ((round + 1) * 3)));
  }
  await expect(page.locator("#remaining-count")).toHaveText("1");
  await page.locator('.choice-button[data-count="1"]').click();
  await page.locator("#draw-button").click();
  await expect(page.locator(".tarot-card-card")).toHaveCount(78);
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
