import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "ai/index.html"), "utf8");
const css = readFileSync(path.join(root, "ai/ai.css"), "utf8");
const js = readFileSync(path.join(root, "ai/ai.js"), "utf8");

test("pro ritual shell exposes one clear compose contract", () => {
  assert.match(html, /data-ui-version="pro-ritual-v1"/);
  assert.match(html, /id="selected-card-tray"/);
  assert.match(html, /id="selected-count"/);
  assert.match(html, /id="pending-count"/);
  assert.match(html, /ai-two-scene-v42/);
});

test("pro ritual code renders the selection tray from current selection only", () => {
  assert.match(js, /selected-card-tray/);
  assert.match(js, /pending-count/);
  assert.match(css, /data-ui-version="pro-ritual-v1"/);
});

test("reading history sits below the active reader as a secondary section", () => {
  const readerStart = html.indexOf('class="ai-reading-stage');
  const historyStart = html.indexOf('id="reading-history-panel"');
  const footerStart = html.indexOf('class="ai-footer"');

  assert.ok(readerStart >= 0, "active reader stage should exist");
  assert.ok(historyStart > readerStart, "history should follow the active reader");
  assert.ok(historyStart < footerStart, "history should stay above the footer");
});
