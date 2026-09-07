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
});

test("AI reader keeps rounds in one server deck and starts a new deck only on reset", () => {
  assert.match(script, /const STORAGE_KEY = "tarot-daily-ai-reading-v3"/);
  assert.match(script, /sessionId/);
  assert.match(script, /createServerSession\(\)/);
  assert.match(script, /\/api\/ai\/deck-sessions\/\$\{encodeURIComponent\(state\.sessionId\)\}\/draw/);
  assert.match(script, /state\.rounds = state\.rounds/);
  assert.match(script, /resetCards\(\)/);
  assert.match(script, /new-reading-button/);
  assert.match(script, /\$\("#ai-question"\)\.value = ""/);
  assert.match(script, /function currentQuestionField\(\)/);
  assert.match(script, /function renderMemoryHistory\(/);
  assert.doesNotMatch(script, /previous_reading_id/);
});

test("server AI Memory is restored only for an authenticated member and is cleared on logout", () => {
  assert.match(script, /async function loadServerDeckSession\(\)/);
  assert.match(script, /function clearPrivateMemory\(\)/);
  assert.match(script, /await loadServerDeckSession\(\)/);
  assert.match(script, /clearPrivateMemory\(\)/);
  assert.match(script, /error\.status === 401[\s\S]*clearPrivateMemory\(\)/);
  assert.match(script, /if \(!state\.user\) applyLocalSession\(state\.localSession\)/);
});

test("AI reset stays enabled after the first answer finishes", () => {
  assert.match(script, /if \(version === state\.requestVersion\) \{\s*state\.busy = false;\s*renderProgress\(\);\s*renderMemory\(\);\s*syncQuestion\(\);\s*\}/);
});
