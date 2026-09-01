import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const homeHtml = readFileSync(path.join(root, "index.html"), "utf8");
const aiHtml = readFileSync(path.join(root, "ai", "index.html"), "utf8");

test("root exposes distinct guest and AI mode actions", () => {
  assert.match(homeHtml, /id="mode-foyer"/);
  assert.match(homeHtml, /id="manual-mode-link"/);
  assert.match(homeHtml, /id="ai-mode-link"/);
  assert.match(homeHtml, /href="\.\/ai\//);
});

test("AI page puts the question stage before the spread stage", () => {
  assert.ok(aiHtml.indexOf("ai-question-stage") < aiHtml.indexOf("ai-spread-stage"));
});

test("AI page includes the witch scene anchor", () => {
  assert.match(aiHtml, /class="witch-scene"/);
  assert.match(aiHtml, /witch-reader\.webp/);
});
