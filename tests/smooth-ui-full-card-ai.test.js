import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aiHtml = readFileSync(path.join(root, "ai", "index.html"), "utf8");
const aiCss = readFileSync(path.join(root, "ai", "ai.css"), "utf8");
const homeCss = readFileSync(path.join(root, "style.css"), "utf8");
const loginCss = readFileSync(path.join(root, "login", "login.css"), "utf8");
const adminCss = readFileSync(path.join(root, "admin", "admin.css"), "utf8");
const errorCopy = readFileSync(path.join(root, "lib", "client", "error-copy.js"), "utf8");

test("AI reader declares one sequential member reading rail", () => {
  assert.match(aiHtml, /class="ai-reading-stage[^\"]*ai-reading-stage--sequential/);
  assert.match(aiHtml, /data-reader-order="question spread reveal answer"/);
});

test("AI card images preserve the complete source card", () => {
  assert.match(aiCss, /\.ai-reveal-stage \.tarot-card-card img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(aiCss, /\.ai-reveal-stage \.tarot-card-card img\s*\{[^}]*aspect-ratio:\s*448\s*\/\s*800/s);
  assert.match(aiCss, /\.ai-reveal-stage \.tarot-card-card img\s*\{[^}]*height:\s*auto/s);
});

test("AI quota failures explain the real recovery action", () => {
  assert.match(errorCopy, /AI_RATE_LIMITED:\s*"[^"]*โควตา\/เครดิตของ OpenAI[^"]*Billing[^"]*Usage[^"]*"/);
});

test("customer and admin pages share one readable desktop shell", () => {
  for (const css of [homeCss, aiCss, loginCss, adminCss]) {
    assert.match(css, /width:\s*min\(1180px,\s*calc\(100%\s*-\s*40px\)\)/);
  }
});

test("admin sign-in does not stretch to match the setup form", () => {
  assert.match(adminCss, /\.admin-auth-grid\s*\{[^}]*align-items:\s*start/s);
});
