import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "ai", "index.html"), "utf8");
const script = readFileSync(path.join(root, "ai", "ai.js"), "utf8");

test("AI reader exposes the active reading Memory and a clear new-reading action", async () => {
  assert.match(html, /<script type="module" src="\.\/ai\.js" defer><\/script>/);
  assert.match(html, /id="memory-status"/);
  assert.match(html, /id="memory-title"/);
  assert.match(html, /id="new-reading-button"/);
  assert.match(script, /from "\.\/memory\.mjs"/);
});

test("AI reader persists Memory for the same spread and clears it on a new reading", () => {
  assert.match(script, /const STORAGE_KEY = "tarot-daily-ai-reading-v1"/);
  assert.doesNotMatch(script, /const STORAGE_KEY = "tarot-daily-deck-v1"/);
  assert.match(script, /memory: null/);
  assert.match(script, /memory: state\.memory/);
  assert.match(script, /pendingMemory/);
  assert.match(script, /memoryOwner/);
  assert.match(script, /normalizeReadingMemory/);
  assert.match(script, /isMemoryForSpread/);
  assert.match(script, /conversationForSpread\(state\.memory, state\.drawn\)/);
  assert.match(script, /appendReadingTurn/);
  assert.match(script, /state\.memory = null/);
  assert.match(script, /new-reading-button/);
  assert.match(script, /\$\("#ai-question"\)\.value = ""/);
});

test("stored AI Memory is restored only for an authenticated member and is cleared on logout", () => {
  assert.match(script, /function restoreSavedMemoryAnswer\(\)/);
  assert.match(script, /function clearPrivateMemory\(\)/);
  assert.match(script, /restoreSavedMemoryAnswer\(\)/);
  assert.match(script, /clearPrivateMemory\(\)/);
  assert.match(script, /error\.status === 401[\s\S]*clearPrivateMemory\(\)/);
});
