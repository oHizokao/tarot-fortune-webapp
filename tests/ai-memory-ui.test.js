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
  assert.match(script, /\/api\/ai\/readings/);
});

test("AI reader uses server Memory for the same spread and clears it on a new reading", () => {
  assert.match(script, /const STORAGE_KEY = "tarot-daily-ai-reading-v2"/);
  assert.match(script, /readingId/);
  assert.match(script, /\/api\/ai\/readings/);
  assert.match(script, /ensureReading\(\)/);
  assert.match(script, /state\.memory = null/);
  assert.doesNotMatch(script, /JSON\.stringify\(\{[^}]*memory/);
  assert.match(script, /new-reading-button/);
  assert.match(script, /\$\("#ai-question"\)\.value = ""/);
});

test("server AI Memory is restored only for an authenticated member and is cleared on logout", () => {
  assert.match(script, /function restoreSavedMemoryAnswer\(\)/);
  assert.match(script, /function clearPrivateMemory\(\)/);
  assert.match(script, /restoreSavedMemoryAnswer\(\)/);
  assert.match(script, /clearPrivateMemory\(\)/);
  assert.match(script, /error\.status === 401[\s\S]*clearPrivateMemory\(\)/);
  assert.match(script, /loadServerReadingForSpread/);
});

test("AI reset stays enabled after the first answer finishes", () => {
  assert.match(script, /if \(version === state\.requestVersion\) \{\s*state\.busy = false;\s*renderMemory\(\);\s*syncQuestion\(\);\s*\}/);
});
