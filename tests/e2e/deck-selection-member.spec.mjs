import { test, expect } from "@playwright/test";

test("member types a question, selects cards, and receives card readings with a summary", async ({ page }) => {
  const api = { rounds: [], nextCard: 1 };
  const sessionPayload = () => {
    const opened = api.rounds.reduce((total, round) => total + round.cards.length, 0);
    return { id: "session-1", status: "active", deck_ready: true, draw_cursor: opened, opened_count: opened, remaining: 78 - opened, rounds: api.rounds };
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
      api.rounds = [];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), remaining: 78 }) });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sessions: [] }) });
      return;
    }
    if (route.request().method() === "POST" && action === "draw") {
      const body = await route.request().postDataJSON();
      const round = { id: `round-${api.rounds.length + 1}`, round_number: api.rounds.length + 1, question: body.question, cards: nextCards(Number(body.count)), status: "drawn", answer_json: null, answer_text: "" };
      api.rounds.push(round);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round, remaining: sessionPayload().remaining }) });
      return;
    }
    if (route.request().method() === "POST" && action === "answer") {
      const round = api.rounds.find((item) => item.id === roundId);
      const structured = {
        verdict: `ฟันธง: ${round.question} ควรเดินหน้าอย่างชัดเจน`,
        cards: round.cards.map((file, index) => ({ position: index + 1, name: index ? "Understanding" : "Relaxation", meaning: "ความหมายของไพ่ที่เกี่ยวข้องกับคำถาม", prediction: "คำทำนายที่ตอบตรงกับคำถามนี้" })),
        overall_prediction: "สรุปคำทำนาย: ไพ่ทั้งชุดชี้ให้เลือกทางที่ถามและลงมือทีละขั้น",
        safety_note: "",
      };
      round.answer_json = structured;
      round.answer_text = structured.verdict;
      round.status = "answered";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, session: sessionPayload(), round, answer: round.answer_text, structured }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, message: "mock route not found" }) });
  });

  await page.goto("/ai/");
  await expect(page.locator("#question-stage")).toBeVisible();
  await page.getByLabel("คำถามของคุณ").fill("เรื่องงานครั้งนี้ควรเดินหน้าต่อไหม?");
  const deck = page.locator("#tarot-deck-card-list .tarot-deck-card");
  await deck.nth(0).click();
  await deck.nth(1).click();
  await expect(page.locator("#draw-button")).toBeEnabled();

  await page.locator("#draw-button").click();
  await expect(page).toHaveURL(/#reading-result$/);
  await expect(page.locator("#reading-result-stage")).toBeVisible();
  await expect(page.locator("#reading-sets .reading-set")).toHaveCount(1);
  await expect(page.locator("#reading-sets .tarot-card-card")).toHaveCount(2);
  await expect(page.locator("#ai-answer .answer-section--cards .answer-card")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator("#ai-answer .answer-section--overall")).toContainText("สรุปคำทำนาย");
  await expect(page.locator("#ai-answer")).not.toContainText("คำแนะนำถัดไป");
});
