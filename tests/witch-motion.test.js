import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aiHtml = readFileSync(path.join(root, "ai", "index.html"), "utf8");
const aiCss = readFileSync(path.join(root, "ai", "ai.css"), "utf8");

test("witch scene layers continuous ambient motion around the character", () => {
  assert.match(aiCss, /\.ai-bg--one,\s*\.ai-bg--two\s*\{[\s\S]*?animation:\s*witchAmbientDrift\s+24s\s+ease-in-out\s+infinite/);
  assert.match(aiCss, /\.ai-reading-stage\.ai-reading-stage--sequential\s+\.witch-art\s*\{[\s\S]*?animation:\s*witchCharacterFloat\s+7s\s+ease-in-out\s+infinite/);
  assert.match(aiCss, /\.ai-reading-stage\.ai-reading-stage--sequential\s+\.witch-orbit--one\s*\{[\s\S]*?animation:\s*witchOrbitSpin\s+22s\s+linear\s+infinite/);
  assert.match(aiCss, /\.ai-reading-stage\.ai-reading-stage--sequential\s+\.witch-orbit--two\s*\{[\s\S]*?animation:\s*witchOrbitSpinReverse\s+31s\s+linear\s+infinite/);
  assert.match(aiCss, /@keyframes\s+witchAmbientDrift/);
  assert.match(aiCss, /@keyframes\s+witchCharacterFloat/);
  assert.match(aiCss, /@keyframes\s+witchOrbitSpinReverse/);
  assert.match(aiHtml, /class="witch-scene"[^>]*data-motion="ambient"/);
});

test("witch scene exposes a high-visibility rotating motion wheel", () => {
  assert.match(aiHtml, /class="witch-motion-wheel"[^>]*data-motion-layer="sigil"/);
  assert.match(aiHtml, /id="motion-toggle"/);
  assert.match(aiHtml, /id="motion-status"/);
  assert.match(aiCss, /\.ai-reading-stage\.ai-reading-stage--sequential\s+\.witch-motion-wheel\s*\{[\s\S]*?animation:\s*witchWheelSpin\s+9s\s+linear\s+infinite/);
  assert.match(aiCss, /\.ai-reading-stage\.ai-reading-stage--sequential\s+\.witch-motion-wheel::after\s*\{[\s\S]*?background:\s*var\(--gold\)/);
  assert.match(aiCss, /@keyframes\s+witchWheelSpin/);
});

test("reduced-motion mode has an explicit opt-in override for the ritual wheel", () => {
  assert.match(aiCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?#ai-reader-app\.motion-enabled[\s\S]*?\.witch-motion-wheel\s*\{[\s\S]*?animation-name:\s*witchWheelSpin\s*!important[\s\S]*?animation-duration:\s*9s\s*!important[\s\S]*?animation-iteration-count:\s*infinite\s*!important/);
});

test("guest mode keeps the witch scene large enough to read the character", () => {
  assert.match(aiCss, /#ai-reader-app\[data-reader-mode\][\s\S]*?\.witch-scene\s*\{[\s\S]*?height:\s*340px/);
  assert.match(aiCss, /#ai-reader-app\[data-reader-mode\][\s\S]*?\.witch-art\s*\{[\s\S]*?height:\s*330px/);
  assert.match(aiCss, /@media\s*\(max-width:\s*650px\)[\s\S]*?#ai-reader-app\[data-reader-mode\][\s\S]*?\.witch-scene\s*\{[\s\S]*?height:\s*250px/);
});

test("witch motion has a reduced-motion escape hatch without disabling the reader", () => {
  assert.match(aiCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.ai-bg--one[\s\S]*?\.witch-art[\s\S]*?animation:\s*none\s*!important/);
  assert.match(aiCss, /\.tarot-card-card\s*\{[\s\S]*?animation:\s*cardReveal/);
});
