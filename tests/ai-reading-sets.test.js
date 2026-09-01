import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { groupReadingHistory } from "../ai/reading-sets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "ai", "index.html"), "utf8");
const script = readFileSync(path.join(root, "ai", "ai.js"), "utf8");
const css = readFileSync(path.join(root, "ai", "ai.css"), "utf8");
const staticServer = readFileSync(path.join(root, "scripts", "static-server.mjs"), "utf8");

test("AI reader renders every draw as a separate reading set", () => {
  assert.match(html, /id="reading-sets"/);
  assert.match(script, /groupReadingHistory/);
  assert.match(script, /data-set-id/);
  assert.match(css, /\.reading-set\s*\{/);
  assert.match(css, /\.reading-set[\s\S]*?\.cards-grid/);
});

test("local static server serves the reading-set browser module as JavaScript", () => {
  assert.match(staticServer, /"\.mjs":\s*"text\/javascript; charset=utf-8"/);
});

test("reading history keeps each draw count and assigns chronological set numbers", () => {
  const sets = groupReadingHistory([
    { id: "set-2", createdAt: 200, cards: ["card-003.webp", "card-004.webp"] },
    { id: "set-1", createdAt: 100, cards: ["card-001.webp"] },
  ]);

  assert.deepEqual(sets.map(({ id, setNumber, cardCount }) => ({ id, setNumber, cardCount })), [
    { id: "set-2", setNumber: 2, cardCount: 2 },
    { id: "set-1", setNumber: 1, cardCount: 1 },
  ]);
});

test("reading history drops malformed groups without changing valid card sets", () => {
  const sets = groupReadingHistory([
    { id: "valid", createdAt: 100, cards: ["card-001.webp", "card-002.webp"] },
    { id: "empty", createdAt: 200, cards: [] },
    { id: "duplicate", createdAt: 300, cards: ["card-005.webp", "card-005.webp"] },
    { id: "unknown", createdAt: 400, cards: ["not-a-card.webp"] },
  ]);

  assert.deepEqual(sets.map(({ id, cards }) => ({ id, cards })), [
    { id: "valid", cards: ["card-001.webp", "card-002.webp"] },
  ]);
});
