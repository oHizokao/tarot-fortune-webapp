import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Vercel flat AI endpoint maps detail, message, and close commands", async () => {
  const { flatAiCommand } = await import("../api/ai/[...route].mjs");

  assert.deepEqual(flatAiCommand(new Request("https://tarot.example/api/ai/tarot-chat?reading_id=read-1")), {
    action: "detail",
    readingId: "read-1",
  });
  assert.deepEqual(flatAiCommand(new Request("https://tarot.example/api/ai/tarot-chat?reading_id=read-1&action=message", { method: "POST" })), {
    action: "message",
    readingId: "read-1",
  });
  assert.deepEqual(flatAiCommand(new Request("https://tarot.example/api/ai/tarot-chat?reading_id=read-1&action=close", { method: "POST" })), {
    action: "close",
    readingId: "read-1",
  });
});

test("AI reader presents and enforces question → draw → answer → new round workflow", async () => {
  const html = await readFile(path.join(root, "ai", "index.html"), "utf8");
  const script = await readFile(path.join(root, "ai", "ai.js"), "utf8");

  assert.match(html, /id="flow-step-question"/);
  assert.match(html, /id="flow-step-draw"/);
  assert.match(html, /id="flow-step-answer"/);
  assert.match(html, /พิมพ์คำถามก่อน/);
  assert.match(html, /id="ai-question"/);
  assert.doesNotMatch(html, /id="follow-up-question"/);
  assert.doesNotMatch(html, /id="ask-ai-button"/);
  assert.match(script, /function currentQuestionField\(\)/);
  assert.match(script, /function hasQuestion\(\)\s*\{\s*return currentQuestionValue\(\)\.length > 0/);
  assert.match(script, /function hasAiAccess\(\)/);
  assert.match(script, /if \(hasAiAccess\(\) && !question\)/);
  assert.match(script, /if \(hasAiAccess\(\) && !question\)[\s\S]*พิมพ์คำถามก่อน/);
  assert.match(script, /answerCurrentRound\(round\.id\)/);
  assert.match(script, /deckSessionUrl\(state\.sessionId, "draw"\)/);
  assert.match(script, /params\.set\("round_id"/);
  assert.doesNotMatch(script, /ask-ai-button/);
  assert.doesNotMatch(script, /previous_reading_id/);
  assert.match(script, /คำถามรอบใหม่/);
  assert.match(script, /duplicateCurrentQuestion/);
  assert.match(script, /state\.currentRoundId = round\.id/);
  assert.match(script, /AI_RATE_LIMITED/);
  assert.match(script, /failedErrorCode/);
  assert.match(script, /messageForError\(error\.code/);
});

test("follow-up readings preserve the prior conversation while closing the previous spread", async () => {
  const source = await readFile(path.join(root, "lib", "vercel", "routes", "ai.mjs"), "utf8");

  assert.match(source, /previous_reading_id/);
  assert.match(source, /SELECT role, content, model, response_id, input_tokens, output_tokens, created_at FROM reading_messages/);
  assert.match(source, /INSERT INTO reading_messages \(session_id, role, content, model, response_id, input_tokens, output_tokens, created_at\)/);
  assert.match(source, /UPDATE reading_sessions SET status = 'closed'/);
});

test("continuous deck routes expose session, draw, answer, and reset operations", async () => {
  const source = await readFile(path.join(root, "lib", "vercel", "routes", "ai.mjs"), "utf8");
  const route = await readFile(path.join(root, "api", "ai", "[...route].mjs"), "utf8");

  for (const operation of ["createDeckSession", "drawReadingRound", "answerReadingRound", "getDeckSession", "resetDeckSession", "deleteDeckSession", "deleteAllDeckSessions"]) {
    assert.match(source, new RegExp(`export async function ${operation}`));
  }
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /request_id/);
  assert.match(route, /deck-sessions/);
  assert.match(route, /rounds/);
  assert.match(route, /request\.method === "DELETE"/);
});

test("deck allocation keeps a single shuffled order and rejects overdraw", async () => {
  const { allocateDeckSlice, createDeckOrder } = await import("../lib/vercel/readings.mjs");
  const deck = createDeckOrder(() => 0.5);
  assert.equal(deck.length, 78);
  assert.equal(new Set(deck).size, 78);
  const first = allocateDeckSlice({ deck_order: deck, draw_cursor: 0 }, 3);
  const second = allocateDeckSlice({ deck_order: deck, draw_cursor: first.nextCursor }, 2);
  assert.equal(first.cards.length, 3);
  assert.equal(second.cards.length, 2);
  assert.equal(new Set([...first.cards, ...second.cards]).size, 5);
  assert.equal(second.nextCursor, 5);
  assert.throws(() => allocateDeckSlice({ deck_order: deck, draw_cursor: 77 }, 2), /ไพ่ไม่พอ/);
});
