const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const mobile520 = css.match(/@media \(max-width: 520px\) \{([\s\S]*)\}\s*$/)?.[1] ?? '';

test('mobile keeps the hero artwork visible', () => {
  assert.doesNotMatch(mobile520, /\.hero-orb\s*\{[^}]*display:\s*none/i);
});

test('mobile preserves the desktop text content', () => {
  assert.doesNotMatch(mobile520, /\.desktop-only\s*\{[^}]*display:\s*none/i);
});

test('mobile keeps drawn cards in the same multi-card composition', () => {
  assert.doesNotMatch(
    mobile520,
    /\.cards-grid:not\(\.is-empty\)\s*\{[^}]*grid-template-columns:\s*1fr/i,
  );
});
