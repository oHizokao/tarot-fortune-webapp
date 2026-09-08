import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "ai", "index.html"), "utf8");
const script = readFileSync(path.join(root, "ai", "ai.js"), "utf8");

test("AI reader exposes one continuous deck Memory and a clear reset action", async () => {
  assert.match(html, /<script type="module" src="\.\/ai\.js(?:\?[^" ]+)?" defer><\/script>/);
  assert.match(html, /id="memory-status"/);
  assert.match(html, /id="memory-title"/);
  assert.match(html, /id="new-reading-button"/);
  assert.match(html, /id="ai-question"/);
  assert.doesNotMatch(html, /id="follow-up-question"/);
  assert.doesNotMatch(html, /id="ask-ai-button"/);
  assert.match(html, /id="memory-history"/);
  assert.match(script, /\/api\/ai\/deck-sessions/);
  assert.match(script, /state\.rounds/);
  assert.match(script, /resetLocalDeckSession/);
  assert.match(html, /id="reading-history-panel"/);
  assert.match(html, /id="start-new-reading-button"/);
});

test("AI reader keeps rounds in one server deck and starts a new deck only on reset", () => {
  assert.match(script, /const STORAGE_KEY = "tarot-daily-ai-reading-v3"/);
  assert.match(script, /sessionId/);
  assert.match(script, /createServerSession\(\)/);
  assert.match(script, /function deckSessionUrl\(sessionId, action = "", roundId = ""\)/);
  assert.match(script, /params\.set\("round_id"/);
  assert.match(script, /deckSessionUrl\(state\.sessionId, "draw"\)/);
  assert.match(script, /state\.rounds = state\.rounds/);
  assert.match(script, /resetCards\(\)/);
  assert.match(script, /new-reading-button/);
  assert.match(script, /\$\("#ai-question"\)\.value = ""/);
  assert.match(script, /function currentQuestionField\(\)/);
  assert.match(script, /function renderMemoryHistory\(/);
  assert.doesNotMatch(script, /previous_reading_id/);
});

test("member login starts a fresh reader while saved sessions stay selectable", () => {
  assert.match(script, /async function loadServerReadingHistory\(\)/);
  assert.match(script, /function clearPrivateMemory\(\)/);
  assert.match(script, /await loadServerReadingHistory\(\)/);
  assert.match(script, /async function openHistorySession\(sessionId\)/);
  assert.match(script, /function startNewReading\(\)/);
  assert.match(script, /state\.viewingHistorySessionId = ""/);
  assert.match(script, /clearPrivateMemory\(\)/);
  assert.doesNotMatch(script, /async function loadServerDeckSession\(\)/);
  assert.match(script, /error\.status === 401[\s\S]*clearPrivateMemory\(\)/);
  assert.match(script, /if \(!state\.user\) applyLocalSession\(state\.localSession\)/);
});

test("AI reset stays enabled after the first answer finishes", () => {
  assert.match(script, /if \(version === state\.requestVersion\) \{\s*state\.busy = false;\s*renderProgress\(\);\s*renderMemory\(\);\s*syncQuestion\(\);\s*\}/);
});
