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

test("AI reader presents and enforces question → draw → answer → new spread workflow", async () => {
  const html = await readFile(path.join(root, "ai", "index.html"), "utf8");
  const script = await readFile(path.join(root, "ai", "ai.js"), "utf8");

  assert.match(html, /id="flow-step-question"/);
  assert.match(html, /id="flow-step-draw"/);
  assert.match(html, /id="flow-step-answer"/);
  assert.match(html, /พิมพ์คำถามก่อน/);
  assert.match(html, /id="follow-up-question"/);
  assert.match(script, /function currentQuestionField\(\)/);
  assert.match(script, /function startFollowUp\(\)/);
  assert.match(script, /function handleAskAction\(\)/);
  assert.match(script, /pendingFollowUpQuestion/);
  assert.match(script, /function hasQuestion\(\)\s*\{\s*return currentQuestionValue\(\)\.length > 0/);
  assert.match(script, /function hasAiAccess\(\)/);
  assert.match(script, /if \(hasAiAccess\(\) && !question\)/);
  assert.match(script, /if \(hasAiAccess\(\) && question\)/);
  assert.match(script, /if \(hasAiAccess\(\) && !question\)[\s\S]*พิมพ์คำถามก่อน/);
  assert.match(script, /askAi\(question\)/);
  assert.match(script, /\/api\/ai\/tarot-chat\?reading_id=/);
  assert.match(script, /\$\("#ask-ai-button"\)\.addEventListener\("click", handleAskAction\)/);
  assert.doesNotMatch(script, /\$\("#ask-ai-button"\)\.addEventListener\("click", askAi\)/);
  assert.match(script, /previous_reading_id/);
  assert.match(html, /ถามต่อ[^<]*จับไพ่ใหม่/);
  assert.match(script, /AI_RATE_LIMITED/);
  assert.match(script, /failedErrorCode/);
  assert.match(script, /messageForError\(state\.failedErrorCode/);
});

test("follow-up readings preserve the prior conversation while closing the previous spread", async () => {
  const source = await readFile(path.join(root, "lib", "vercel", "routes", "ai.mjs"), "utf8");

  assert.match(source, /previous_reading_id/);
  assert.match(source, /SELECT role, content, model, response_id, input_tokens, output_tokens, created_at FROM reading_messages/);
  assert.match(source, /INSERT INTO reading_messages \(session_id, role, content, model, response_id, input_tokens, output_tokens, created_at\)/);
  assert.match(source, /UPDATE reading_sessions SET status = 'closed'/);
});
