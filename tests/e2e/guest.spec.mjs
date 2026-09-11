import { test, expect } from "@playwright/test";

async function installMemberApi(page, userOverrides = {}) {
  const api = {
    session: false,
    rounds: [],
    nextCard: 1,
    drawCalls: 0,
    drawRequests: [],
    abortFirstDrawResponse: false,
    abortedDrawResponse: false,
    answerCalls: 0,
    answerFailureCodes: [],
    answerDelay: 0,
    drawGate: null,
    releaseDraw: null,
    answerGate: null,
    releaseAnswer: null,
    logoutCalls: 0,
    logoutGate: null,
  };
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
    body: JSON.stringify({ ok: true, authenticated: true, csrf_token: "test-csrf", backend_configured: true, user: { username: "tester", name: "ผู้ใช้งาน", ai_enabled: true, must_change_password: false, ...userOverrides } }),
  }));
  await page.route("**/api/auth/logout", async (route) => {
    api.logoutCalls += 1;
    if (api.logoutGate) await api.logoutGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
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
      api.drawCalls += 1;
      api.drawRequests.push({ request_id: body.request_id, selected_indexes: body.selected_indexes, count: body.count, question: body.question });
      const existing = api.rounds.find((item) => item.request_id === body.request_id);
      if (existing) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round: existing, remaining: sessionPayload().remaining, idempotent: true }) });
        return;
      }
      const selectedIndexes = Array.isArray(body.selected_indexes) ? body.selected_indexes : [];
      const occupied = api.rounds.some((item) => item.selected_indexes?.some((index) => selectedIndexes.includes(index)));
      if (occupied) {
        await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, code: "SELECTED_SLOT_USED", message: "ตำแหน่งไพ่ถูกเปิดไปแล้ว กรุณาเลือกใบที่ยังไม่เปิด" }) });
        return;
      }
      const round = { id: `round-${api.rounds.length + 1}`, request_id: body.request_id, selected_indexes: selectedIndexes, round_number: api.rounds.length + 1, question: body.question, cards: nextCards(Number(body.count)), status: "drawn", answer_json: null, answer_text: "" };
      api.rounds.push(round);
      if (api.drawGate) await api.drawGate;
      if (api.abortFirstDrawResponse && api.drawCalls === 1) {
        api.abortFirstDrawResponse = false;
        api.abortedDrawResponse = true;
        await route.abort();
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round, remaining: sessionPayload().remaining }) });
      return;
    }
    if (route.request().method() === "POST" && action === "answer") {
      const round = api.rounds.find((item) => item.id === roundId);
      api.answerCalls += 1;
      const failureCode = api.answerFailureCodes.shift();
      if (failureCode) {
        const failureStatus = failureCode === "ACCOUNT_AUTH_REQUIRED" ? 401 : 503;
        await route.fulfill({ status: failureStatus, contentType: "application/json", body: JSON.stringify({ ok: false, code: failureCode, request_id: "answer-failure-1", message: failureCode === "ACCOUNT_AUTH_REQUIRED" ? "เซสชันหมดอายุ" : "AI ยังไม่พร้อมชั่วคราว" }) });
        return;
      }
      const structured = structuredAnswer(round);
      round.answer_json = structured;
      round.answer_text = structured.verdict;
      round.status = "answered";
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

test("member answer failure keeps the active result scene visible and retry answers the same draw", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.answerFailureCodes = ["AI_UPSTREAM_ERROR"];
  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("คำถามนี้ควรได้รับคำตอบที่ชัดเจนไหม?");
  await selectCards(page, 1);
  await page.locator("#draw-button").click();

  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#ai-answer-stage")).toBeVisible();
  await expect(page.locator("#ai-answer-stage")).toContainText("AI ยังไม่พร้อมชั่วคราว");
  await expect(page.locator("#retry-ai-button")).toBeVisible();

  await page.locator("#retry-ai-button").click();
  await expect(page.locator("#ai-answer .answer-section--overall")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#ai-answer-stage")).not.toContainText("AI ยังไม่พร้อมชั่วคราว");
  expect(api.drawCalls).toBe(1);
  expect(api.answerCalls).toBe(2);
});

test("member auth expiry during answer returns to a usable guest reader", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.answerFailureCodes = ["ACCOUNT_AUTH_REQUIRED"];
  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("ถ้าเซสชันหมดอายุควรกลับมาเปิดไพ่ต่อได้ไหม?");
  await selectCards(page, 1);
  await page.locator("#draw-button").click();

  await expect(page.locator("#ai-reader-app")).toHaveAttribute("data-reader-mode", "guest");
  await expect(page.locator("#question-stage")).toBeHidden();
  await page.locator("#tarot-deck-card-list .tarot-deck-card:not(.is-used)").first().click();
  await expect(page.locator("#draw-button")).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator("#ai-answer-stage")).toBeHidden();
  await expect(page.locator("#reading-history-list")).toBeEmpty();
});

test("member logout invalidates a held answer and stays in guest mode after the stale response is released", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.answerGate = new Promise((resolve) => { api.releaseAnswer = resolve; });
  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("คำตอบนี้ต้องไม่กลับมาหลังออกจากระบบ");
  await selectCards(page, 1);
  await page.locator("#draw-button").click();
  await expect.poll(() => api.answerCalls).toBe(1);

  await page.locator("#account-link").click();
  await expect(page.locator("#ai-reader-app")).toHaveAttribute("data-reader-mode", "guest");
  await expect(page.locator("#guest-mode-banner")).toBeVisible();
  await expect(page.locator("#question-stage")).toBeHidden();
  await expect(page.locator("#reading-history-panel")).toBeHidden();

  api.releaseAnswer();
  await expect(page.locator("#reader-result-view")).toBeHidden();
  await expect(page.locator("#ai-answer-stage")).toHaveAttribute("hidden", "");
  await expect(page.locator("#ai-answer")).toBeEmpty();
  await expect(page.locator("#reading-history-list")).toBeEmpty();
});

test("member replays a committed draw with the same idempotency intent after the first response is lost", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.abortFirstDrawResponse = true;
  await page.goto("/ai/");
  await page.getByLabel("คำถามของคุณ").fill("ถ้าการเปิดไพ่สำเร็จแต่การตอบกลับหายไปควรทำอย่างไร?");
  await selectCards(page, 1);
  await page.locator("#draw-button").click();

  await expect.poll(() => api.abortedDrawResponse).toBe(true);
  await expect(page.locator("#draw-button")).toBeEnabled({ timeout: 10_000 });
  await page.locator("#draw-button").click();

  await expect(page.locator("#reader-result-view")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#reading-sets .reading-set")).toHaveCount(1);
  await expect(page.locator("#opened-count")).toHaveText("1");
  await expect(page.locator("#remaining-count")).toHaveText("77");
  await expect.poll(() => api.drawRequests.length).toBe(2);
  expect(api.rounds).toHaveLength(1);
  expect(api.drawRequests[1].request_id).toBe(api.drawRequests[0].request_id);
  expect(api.drawRequests[1].selected_indexes).toEqual(api.drawRequests[0].selected_indexes);
});

test("member starts with one concise question composer and account action in the top navigation", async ({ page }) => {
  await installMemberApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ai/");

  await expect(page.locator("#question-title")).toHaveText("วันนี้อยากถามไพ่เรื่องอะไร?");
  await expect(page.locator("#question-description")).toHaveText("พิมพ์คำถาม แล้วเลือกไพ่ได้สูงสุด 3 ใบ");
  await expect(page.locator("#question-label")).toHaveText("คำถามของคุณ");
  await expect(page.locator("#ai-question")).toHaveAttribute("placeholder", "เช่น ความรักช่วงนี้จะเป็นอย่างไร?");
  await expect(page.locator("#question-hint")).toHaveText("ระบุเรื่องที่อยากรู้ให้ชัดเจน");
  await expect(page.locator("#account-callout")).toBeHidden();
  await expect(page.locator("#account-link")).toContainText("ผู้ใช้งาน");
  await expect(page.locator("#account-link")).toContainText("ออกจากระบบ");
  await expect(page.getByText("ออกจากระบบ", { exact: false })).toHaveCount(1);

  const stageOrder = await page.evaluate(() => {
    const question = document.querySelector("#question-stage")?.getBoundingClientRect();
    const deck = document.querySelector("#tarot-deck-zone")?.getBoundingClientRect();
    return {
      questionBottom: question?.bottom ?? 0,
      deckTop: deck?.top ?? 0,
    };
  });
  expect(stageOrder.questionBottom).toBeLessThanOrEqual(stageOrder.deckTop + 1);
});

test("member without AI permission can read the account status without blocking free cards", async ({ page }) => {
  await installMemberApi(page, { ai_enabled: false });
  await page.goto("/ai/");

  await expect(page.locator("#question-stage")).toBeHidden();
  await expect(page.locator("#account-callout")).toBeVisible();
  await expect(page.locator("#account-title")).toHaveText("บัญชีนี้ยังรอสิทธิ์ AI");
  await expect(page.locator("#account-message")).toHaveText("ผู้ดูแลยังไม่ได้เปิดสิทธิ์ AI ให้บัญชีนี้ คุณยังเปิดไพ่แบบปกติได้");
  await expect(page.locator("#tarot-deck-zone")).toBeVisible();
});

test("member who must change password gets an accessible account action without duplicate logout", async ({ page }) => {
  await installMemberApi(page, { must_change_password: true });
  await page.goto("/ai/");

  await expect(page.locator("#question-stage")).toBeHidden();
  await expect(page.locator("#account-callout")).toBeVisible();
  await expect(page.locator("#account-title")).toHaveText("ต้องเปลี่ยนรหัสผ่านก่อนใช้ AI");
  await expect(page.locator("#account-message")).toHaveText("ตั้งรหัสผ่านใหม่แล้วกลับมาถามไพ่ได้ คุณยังเปิดไพ่แบบปกติได้");
  await expect(page.locator("#account-action")).toHaveText("เปลี่ยนรหัสผ่าน");
  await expect(page.locator("#account-action")).toHaveAttribute("href", "../login/?next=/ai/");
  await expect(page.getByText("ออกจากระบบ", { exact: false })).toHaveCount(1);
  await page.locator("#account-action").click();
  await expect(page).toHaveURL(/\/login\/\?next=\/ai\/$/);
});

test("member question composer is readable, aligned, and stable on desktop", async ({ page }) => {
  await installMemberApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ai/");

  const field = page.getByLabel("คำถามของคุณ");
  const label = page.locator("#question-label");
  const hint = page.locator("#question-hint");
  await expect(field).toHaveAttribute("aria-describedby", /(?:^|\s)question-hint(?:\s|$)/);
  await expect(field).toHaveAttribute("aria-describedby", /(?:^|\s)request-status(?:\s|$)/);

  const empty = await field.evaluate((element) => {
    const style = getComputedStyle(element);
    const placeholder = getComputedStyle(element, "::placeholder");
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      borderWidth: style.borderWidth,
      borderRadius: style.borderRadius,
      background: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      padding: style.padding,
      placeholderColor: placeholder.color,
      placeholderOpacity: placeholder.opacity,
    };
  });
  expect({ ...empty, height: undefined }).toEqual({
    width: 760,
    height: undefined,
    borderWidth: "1px",
    borderRadius: "16px",
    background: "rgb(23, 19, 32)",
    color: "rgb(245, 240, 232)",
    fontSize: "18px",
    lineHeight: "31.5px",
    padding: "22px 24px",
    placeholderColor: "rgb(186, 178, 200)",
    placeholderOpacity: "1",
  });
  expect(empty.height).toBeCloseTo(148, 3);

  const labelWidth = await label.evaluate((element) => element.getBoundingClientRect().width);
  const hintWidth = await hint.evaluate((element) => element.getBoundingClientRect().width);
  expect(labelWidth).toBe(empty.width);
  expect(hintWidth).toBe(empty.width);

  await field.focus();
  await expect(field).toHaveCSS("border-color", "rgb(216, 191, 140)");
  const focused = await field.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, borderWidth: style.borderWidth, borderColor: style.borderColor };
  });
  expect(focused).toMatchObject({ borderWidth: "1px", borderColor: "rgb(216, 191, 140)" });
  expect(focused.width).toBeCloseTo(empty.width, 3);
  expect(focused.height).toBeCloseTo(empty.height, 3);

  const longThaiQuestion = "ฉันกำลังพิจารณาเปลี่ยนงานในช่วงปลายปีนี้ แต่ยังไม่แน่ใจว่าควรเลือกโอกาสใหม่ที่ท้าทายหรืออยู่ในที่เดิมเพื่อสร้างความมั่นคง ไพ่ต้องการชี้ให้เห็นปัจจัยใดที่ฉันควรพิจารณาอย่างรอบคอบก่อนตัดสินใจ?";
  await field.fill(longThaiQuestion);
  await expect(field).toHaveValue(longThaiQuestion);
});

test("member question composer stays legible without overflow on mobile", async ({ page }) => {
  await installMemberApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ai/");

  const field = page.getByLabel("คำถามของคุณ");
  await page.evaluate(() => document.fonts.ready);
  const before = await field.boundingBox();
  expect(before).not.toBeNull();
  await expect(field).toHaveCSS("font-size", "16px");
  await expect(field).toHaveCSS("min-height", "136px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await field.focus();
  await expect(field).toHaveCSS("border-color", "rgb(216, 191, 140)");
  const after = await field.boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBeCloseTo(before?.height, 3);
});

test("member question composer fits every acceptance viewport with usable controls", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await installMemberApi(page);
  const evidence = [];

  for (const width of [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto("/ai/");
    await page.evaluate(() => document.fonts.ready);

    const beforeFocus = await page.evaluate(() => {
      const luminance = (color) => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => Number(value) / 255).map((value) => (
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
        ));
        return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
      };
      const contrast = (foreground, background) => {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      };
      const field = document.querySelector("#ai-question");
      const fieldRect = field.getBoundingClientRect();
      const fieldStyle = getComputedStyle(field);
      const placeholderStyle = getComputedStyle(field, "::placeholder");
      const controls = ["#ai-question", "#draw-button", "#reset-button"].map((selector) => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        return { selector, width: rect.width, height: rect.height };
      });
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        fieldLeft: fieldRect.left,
        fieldRight: fieldRect.right,
        fieldWidth: fieldRect.width,
        fieldHeight: fieldRect.height,
        fieldFontSize: Number.parseFloat(fieldStyle.fontSize),
        textContrast: contrast(fieldStyle.color, fieldStyle.backgroundColor),
        placeholderContrast: contrast(placeholderStyle.color, fieldStyle.backgroundColor),
        controls,
      };
    });

    expect(beforeFocus.scrollWidth).toBeLessThanOrEqual(beforeFocus.viewportWidth);
    expect(beforeFocus.fieldLeft).toBeGreaterThanOrEqual(0);
    expect(beforeFocus.fieldRight).toBeLessThanOrEqual(beforeFocus.viewportWidth);
    expect(beforeFocus.fieldFontSize).toBeGreaterThanOrEqual(16);
    expect(beforeFocus.textContrast).toBeGreaterThanOrEqual(4.5);
    expect(beforeFocus.placeholderContrast).toBeGreaterThanOrEqual(4.5);
    for (const control of beforeFocus.controls) {
      expect(control.width, `${control.selector} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${control.selector} height`).toBeGreaterThanOrEqual(44);
    }

    const field = page.locator("#ai-question");
    await field.focus();
    await expect(field).toHaveCSS("border-color", "rgb(216, 191, 140)");
    const focused = await field.evaluate((field) => {
      const luminance = (color) => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => Number(value) / 255).map((value) => (
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
        ));
        return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
      };
      const style = getComputedStyle(field);
      const rect = field.getBoundingClientRect();
      const border = luminance(style.borderColor);
      const background = luminance(style.backgroundColor);
      return {
        width: rect.width,
        height: rect.height,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        borderContrast: (Math.max(border, background) + 0.05) / (Math.min(border, background) + 0.05),
      };
    });
    expect(focused.borderColor).toBe("rgb(216, 191, 140)");
    expect(focused.borderWidth).toBe("1px");
    expect(focused.borderContrast).toBeGreaterThanOrEqual(3);
    expect(focused.width).toBeCloseTo(beforeFocus.fieldWidth, 3);
    expect(focused.height).toBeCloseTo(beforeFocus.fieldHeight, 3);

    evidence.push({ ...beforeFocus, focused });
    await page.screenshot({ path: testInfo.outputPath(`composer-${width}px.png`), fullPage: false });
  }

  console.log(`ACCEPTANCE_VIEWPORT_METRICS ${JSON.stringify(evidence)}`);
});

test("member can navigate and enter multiline Thai without submitting from the keyboard", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  await page.goto("/ai/");

  const field = page.getByLabel("คำถามของคุณ");
  const drawButton = page.locator("#draw-button");
  await page.locator("#tarot-deck-card-list .tarot-deck-card").first().click();
  await expect(drawButton).toBeDisabled();

  await field.focus();
  await expect(field).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#tarot-deck-card-list .tarot-deck-card").first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(field).toBeFocused();

  const firstLine = "ความรักช่วงนี้จะเป็นอย่างไร?";
  await page.keyboard.type(firstLine);
  await expect(field).toHaveValue(firstLine);
  await expect(drawButton).toBeEnabled();
  expect(api.drawCalls).toBe(0);
  expect(api.answerCalls).toBe(0);

  await page.keyboard.press("Enter");
  await page.keyboard.type("ฉันควรสังเกตอะไรเพิ่มเติม");
  await expect(field).toHaveValue(`${firstLine}\nฉันควรสังเกตอะไรเพิ่มเติม`);
  await expect(page.locator("#reader-compose-view")).toBeVisible();
  await expect(page).not.toHaveURL(/#reading-result$/);
  expect(api.drawCalls).toBe(0);
  expect(api.answerCalls).toBe(0);

  const longThaiQuestion = "ฉันกำลังพิจารณาเปลี่ยนงานในช่วงปลายปีนี้ แต่ยังไม่แน่ใจว่าควรเลือกโอกาสใหม่ที่ท้าทายหรืออยู่ในที่เดิมเพื่อสร้างความมั่นคง ไพ่ต้องการชี้ให้เห็นปัจจัยใดที่ฉันควรพิจารณาอย่างรอบคอบก่อนตัดสินใจ?";
  await field.fill(longThaiQuestion);
  await expect(field).toHaveValue(longThaiQuestion);
  await field.fill("");
  await expect(field).toHaveValue("");
  await expect(drawButton).toBeDisabled();
  expect(api.drawCalls).toBe(0);
  expect(api.answerCalls).toBe(0);
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
  await expect(page.locator("#opened-count")).toHaveText("0");
  await expect(page.locator("#pending-count")).toHaveText("1");
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
  await expect(page.locator("#question-title")).toHaveText("อยากถามอะไรต่อ?");
  await expect(page.locator("#question-description")).toHaveText("พิมพ์คำถาม แล้วเลือกไพ่ได้สูงสุด 3 ใบ");
  await expect(page.locator("#question-label")).toHaveText("คำถามของคุณ");
  await expect(page.locator("#question-hint")).toHaveText("เลือกไพ่ใหม่ได้เลย ระบบยังจำเรื่องที่คุยกันไว้");
  await expect(page.locator("#ai-question")).toHaveAttribute("placeholder", "เช่น ความรักช่วงนี้จะเป็นอย่างไร?");
  await expect(page.locator("#ai-question")).toBeFocused();
  await page.getByLabel("คำถามของคุณ").fill("แล้วก้าวต่อไปล่ะ?");
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

test("member can resume an unanswered history round", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const api = await installMemberApi(page);
  api.session = true;
  api.rounds = [{ id: "round-drawn-1", round_number: 1, question: "รอบที่ยังไม่ได้รับคำตอบควรทำอย่างไร?", cards: ["card-001.webp"], status: "drawn", answer_json: null, answer_text: "" }];
  await page.goto("/ai/");
  await page.getByRole("button", { name: /ดูย้อนหลัง/ }).click();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#retry-ai-button")).toBeVisible();
  await page.locator("#retry-ai-button").click();
  await expect(page.locator("#ai-answer .answer-section--overall")).toBeVisible({ timeout: 10_000 });
  expect(api.answerCalls).toBe(1);
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
