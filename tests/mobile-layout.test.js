import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'style.css'), 'utf8');
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
