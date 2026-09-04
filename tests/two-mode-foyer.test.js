import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const homeHtml = readFileSync(path.join(root, "index.html"), "utf8");
const aiHtml = readFileSync(path.join(root, "ai", "index.html"), "utf8");
const aiCss = readFileSync(path.join(root, "ai", "ai.css"), "utf8");

test("root exposes distinct guest and AI mode actions", () => {
  assert.match(homeHtml, /id="mode-foyer"/);
  assert.match(homeHtml, /id="manual-mode-link"/);
  assert.match(homeHtml, /id="ai-mode-link"/);
  assert.match(homeHtml, /href="\.\/login\/\?next=\/ai\//);
});

test("AI page keeps card reading public and gates only the question feature", () => {
  assert.match(aiHtml, /id="guest-mode-banner"/);
  assert.match(aiHtml, /class="[^"]*member-only[^"]*"[^>]*id="question-stage"/);
  assert.match(aiHtml, /class="[^"]*member-only[^"]*"[^>]*id="ai-answer-stage"/);
  assert.match(aiHtml, /id="draw-button"[^>]*>/);
  assert.match(aiHtml, /โหมดเปิดไพ่ฟรี/);
});

test("AI reader layout gives guest cards priority over the witch illustration", () => {
  assert.match(aiHtml, /id="flow-number-spread">01<\/span>/);
  assert.match(aiHtml, /id="flow-number-draw">02<\/span>/);
  assert.match(aiCss, /#ai-reader-app\[data-reader-mode="guest"\][\s\S]*?\.witch-scene[\s\S]*?min-height:\s*280px/);
  assert.match(aiCss, /\.ai-reveal-stage \.cards-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit/);
});

test("AI page puts the question stage before the spread stage", () => {
  assert.ok(aiHtml.indexOf("ai-question-stage") < aiHtml.indexOf("ai-spread-stage"));
});

test("AI page includes the witch scene anchor", () => {
  assert.match(aiHtml, /class="witch-scene"/);
  assert.match(aiHtml, /witch-reader\.webp/);
  assert.ok(existsSync(path.join(root, "assets", "witch", "witch-reader.webp")));
});

test("AI question field keeps the accessible customer-facing label", () => {
  assert.match(aiHtml, /<label class="question-label" for="ai-question">คำถามของคุณ<\/label>/);
  assert.match(aiHtml, /<section class="ai-question-stage panel question-panel member-only" id="question-stage"[^>]*aria-label="ขั้นที่ 1 พิมพ์คำถาม"[^>]*hidden>/);
});

test("customer pages version their JavaScript and CSS assets", () => {
  assert.match(homeHtml, /style\.css\?v=20260901-witch-two-modes/);
  assert.match(homeHtml, /app\.js\?v=20260901-witch-two-modes/);
  assert.match(aiHtml, /ai\.css\?v=20260904-ai-flow-v20/);
  assert.match(aiHtml, /ai\.js\?v=20260904-ai-flow-v20/);
  assert.match(aiHtml, /สรุปคำทำนายอย่างอ่อนโยน/);
  assert.doesNotMatch(aiHtml, /เชื่อมโยงกับคำถามของคุณอย่างอ่อนโยน/);
});
