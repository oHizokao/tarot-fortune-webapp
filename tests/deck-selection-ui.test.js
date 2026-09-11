import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../ai/index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../ai/ai.css", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../ai/ai.js", import.meta.url), "utf8");

test("AI reader uses a full-deck selection step before prediction", () => {
  assert.match(html, /id="tarot-deck-zone"/);
  assert.match(html, /id="tarot-deck-card-list"/);
  assert.doesNotMatch(html, /id="selected-cards"/);
  assert.doesNotMatch(html, /class="selection-status"/);
  assert.match(html, /id="draw-button"[^>]*data-action="predict"/);
  assert.match(html, /id="draw-label">ทำนาย</);
  assert.doesNotMatch(html, /class="choice-row"/);
});

test("full-deck selection has a stable motion surface and mobile layout", () => {
  assert.match(css, /\.tarot-deck-zone[\s\S]*?perspective/);
  assert.match(css, /\.tarot-deck[\s\S]*?animation:\s*tarotDeckOrbit/);
  assert.match(css, /\.tarot-deck-card/);
  assert.match(css, /\.tarot-deck-card\.is-used/);
  assert.match(css, /aspect-ratio:\s*448\s*\/\s*800/);
  assert.match(css, /@media \(max-width: 650px\)[\s\S]*?\.tarot-deck-zone/);
});

test("deck guidance stays outside the card surface", () => {
  const guidanceIndex = html.indexOf('class="deck-guidance"');
  const deckIndex = html.indexOf('id="tarot-deck-zone"');

  assert.ok(guidanceIndex >= 0, "deck guidance should exist");
  assert.ok(deckIndex > guidanceIndex, "deck guidance should come before the interactive deck");
  assert.match(html, /id="deck-center-title"/);
  assert.match(html, /id="deck-center-message"/);
  assert.match(html, /class="tarot-deck-center"[^>]*>\s*<span class="tarot-deck-center__sigil"[^>]*>✦<\/span>\s*<\/div>/);
  assert.match(css, /\.deck-guidance[\s\S]*?border/);
});

test("prediction is driven by selected cards instead of a count picker", () => {
  assert.match(js, /MAX_SELECTED_CARDS\s*=\s*3/);
  assert.match(js, /selectedCards/);
  assert.match(js, /function selectDeckCard/);
  assert.match(js, /function predictSelectedCards/);
  assert.match(js, /usedDeckIndexes/);
  assert.match(js, /is-used/);
  assert.match(js, /setReaderView\("result",\s*\{\s*updateUrl:\s*true/);
  assert.match(js, /nextView === "result" \? "#reading-result"/);
});
