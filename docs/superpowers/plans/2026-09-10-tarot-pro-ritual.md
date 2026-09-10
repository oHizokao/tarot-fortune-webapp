# Tarot Daily Pro Ritual Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ( - [ ] ) syntax for tracking.

**Goal:** ปรับ Tarot Daily ให้เป็น Pro Ritual Reader ที่อ่านง่าย ลื่น และใช้จริงได้บน Guest/Member โดยไม่ทำลาย engine ไพ่และ API เดิม

**Architecture:** คง ai/ai.js เป็น state/orchestration หลัก, ai/deck-session.mjs เป็น engine สำรับ, และ API/server contract เดิมไว้ ปรับ markup ให้มี selected tray/counter ที่สื่อความหมายชัด เพิ่ม CSS visual layer v41 สำหรับ shell/deck/result และเพิ่ม regression tests ก่อนเปลี่ยน behavior

**Tech Stack:** Static HTML, CSS, browser ES modules, Node test runner, Playwright E2E, Vercel serverless APIs

**Spec:** docs/superpowers/specs/2026-09-10-tarot-pro-ritual-design.md

## Global Constraints

- ต้องคง Guest manual mode และ Member AI mode แยกกัน
- Guest ต้องเปิดไพ่ได้โดยไม่ล็อกอิน
- ไพ่ต้องไม่ซ้ำจนกว่าจะกดล้างไพ่
- selectedIndexes, pendingDrawCount และ usedIndexes ต้องไม่ถูกนับปนกัน
- Motion ต้องเปิดไว้เสมอ แต่ต้องมี reduced-motion fallback
- รูปไพ่ผลลัพธ์ต้องเห็นเต็มสัดส่วนด้วย object-fit: contain
- ห้ามใส่ API key, password หรือ token ใน source, test fixture, log หรือเอกสาร
- ห้ามแก้ไขหรือลบ output/
- ทุก production behavior change ต้องมี failing test ก่อน implementation

---

### Task 1: Pro shell, copy hierarchy, and selected-tray contract

**Files:**
- Modify: ai/index.html
- Modify: ai/ai.css
- Modify: ai/ai.js
- Create: tests/pro-ritual-ui.test.js
- Test: tests/e2e/pro-ritual-reader.spec.mjs

**Interfaces:**
- Consumes: existing reader scene IDs, tarot-deck-zone, tarot-deck-card-list, and state.selectedCards
- Produces: data-ui-version="pro-ritual-v1", selected-card-tray, selected-count, pending-count, and a visually flat compose/result shell

- [ ] Step 1: Write the failing static contract test

Add tests/pro-ritual-ui.test.js:

~~~~js
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
  assert.match(html, /ai-two-scene-v41/);
});

test("pro ritual code renders the selection tray from current selection only", () => {
  assert.match(js, /selected-card-tray/);
  assert.match(js, /pending-count/);
  assert.match(css, /data-ui-version="pro-ritual-v1"/);
});
~~~~

- [ ] Step 2: Run the static contract test and confirm the expected RED failure

Run:

    node --test tests/pro-ritual-ui.test.js

Expected: FAIL because the v41 attribute, selected tray, counters, and selectors do not exist yet.

- [ ] Step 3: Add the shell markup and exact cache-buster

In ai/index.html:

- add data-ui-version="pro-ritual-v1" to #ai-reader-app
- keep existing scene IDs and hidden member-only sections
- add #selected-card-tray directly below #tarot-deck-zone
- add #selected-count and #pending-count inside the progress label
- change stylesheet and module query strings to ai-two-scene-v41
- shorten visible instructional copy to one sentence per section

- [ ] Step 4: Add minimal v41 flat-shell CSS

Append a v41 block to ai/ai.css that:

- removes border, shadow, and background from the compose/result panels
- uses one centered content width and a single vertical reading path
- hides the old flow rail visually while retaining its accessible DOM
- makes tarot-deck-zone the dominant compose surface
- gives the selected tray a single calm divider instead of nested cards
- keeps result card images contained and fully visible
- preserves visible ritual motion and a mobile breakpoint at 650px

- [ ] Step 5: Run the static contract test and verify GREEN

Run:

    node --test tests/pro-ritual-ui.test.js

Expected: PASS with no warnings.

- [ ] Step 6: Commit the shell checkpoint

Run:

    git add ai/index.html ai/ai.css tests/pro-ritual-ui.test.js
    git commit -m "feat: establish pro ritual reader shell"

### Task 2: Selection tray and correct deck counters

**Files:**
- Modify: ai/ai.js
- Modify: ai/index.html
- Modify: ai/ai.css
- Create: tests/e2e/pro-ritual-reader.spec.mjs
- Test: tests/e2e/guest.spec.mjs
- Test: tests/e2e/reader-scenes.spec.mjs

**Interfaces:**
- Consumes: state.selectedCards, state.usedDeckIndexes, state.pendingDrawCount, openedCount(), and remainingCount()
- Produces: renderSelectedTray(), stable counter semantics, and no accidental selected-to-used transition during loading

- [ ] Step 1: Write the failing Playwright behavior tests

Add tests/e2e/pro-ritual-reader.spec.mjs:

~~~~js
import { test, expect } from "@playwright/test";

test("selection tray shows exactly the selected cards and clears after commit", async ({ page }) => {
  await page.goto("/ai/");
  const cards = page.locator("#tarot-deck-card-list .tarot-deck-card");
  await cards.nth(4).click();
  await cards.nth(21).click();
  await expect(page.locator("#selected-card-tray .selected-card-slot")).toHaveCount(2);
  await expect(page.locator("#selected-count")).toHaveText("2");
  await expect(page.locator("#pending-count")).toHaveText("0");
  await page.locator("#draw-button").click();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#selected-card-tray .selected-card-slot")).toHaveCount(0);
  await expect(page.locator("#opened-count")).toHaveText("2");
  await expect(page.locator("#remaining-count")).toHaveText("76");
});

test("selected card stays distinct from used card while a draw request is pending", async ({ page }) => {
  await page.goto("/ai/");
  await page.locator("#tarot-deck-card-list .tarot-deck-card").first().click();
  await page.locator("#draw-button").click();
  await expect(page.locator("#reader-result-view")).toBeVisible();
  await expect(page.locator("#opened-count")).toHaveText("1");
  await expect(page.locator("#remaining-count")).toHaveText("77");
});
~~~~

- [ ] Step 2: Run only the new E2E test and confirm RED

Run:

    npx playwright test tests/e2e/pro-ritual-reader.spec.mjs --project=desktop-chromium

Expected: FAIL because the tray and counter nodes are not rendered.

- [ ] Step 3: Implement renderSelectedTray()

Add a function in ai/ai.js that replaces #selected-card-tray children from state.selectedCards only. Each slot must include a slot number, card deck index, a remove button that calls the existing selection toggle path, and an aria-label. Render an empty instructional state when there is no selection.

- [ ] Step 4: Separate committed and pending counter values

Update renderProgress() so:

- opened-count is openedCount() only
- remaining-count is remainingCount() minus pendingDrawCount only while a request is pending
- selected-count is state.selectedCards.length
- pending-count is state.pendingDrawCount
- progress aria-valuenow tracks committed opened cards plus pending cards

Call renderSelectedTray() from renderAll(), renderProgress(), and selectDeckCard(). Do not add selected cards to usedDeckIndexes until commitVisualRound() succeeds.

- [ ] Step 5: Add distinct selected/locked/used styles

In v41 CSS:

- is-selected uses mint/gold glow and full opacity
- is-disabled:not(.is-used) uses muted opacity and grayscale
- is-used uses charcoal/black treatment
- tray slots stay readable on mobile and do not become an extra boxed column

- [ ] Step 6: Run the new E2E test and the existing deck tests

Run:

    npx playwright test tests/e2e/pro-ritual-reader.spec.mjs tests/e2e/deck-selection.spec.mjs tests/e2e/reader-scenes.spec.mjs

Expected: all selected-tray, 1/2/3-card, drag, and scene-navigation tests pass.

- [ ] Step 7: Commit the counter checkpoint

Run:

    git add ai/ai.js ai/index.html ai/ai.css tests/e2e/pro-ritual-reader.spec.mjs
    git commit -m "fix: make tarot selection and deck counts explicit"

### Task 3: Result scene, loading ritual, and professional answer hierarchy

**Files:**
- Modify: ai/index.html
- Modify: ai/ai.js
- Modify: ai/ai.css
- Modify: tests/e2e/guest.spec.mjs
- Modify: tests/e2e/member-ai.spec.mjs

**Interfaces:**
- Consumes: renderCards(), renderAnswer(), answerCurrentRound(), renderWaitingRitual(), and structured answer fields
- Produces: card-first result scene, persistent AI waiting ritual, direct verdict-first copy, and concise per-card/summary presentation

- [ ] Step 1: Write the failing result hierarchy assertions

Add these assertions to the member E2E flow:

~~~~js
await expect(page.locator("#ai-answer .answer-section--verdict")).toBeVisible();
await expect(page.locator("#ai-answer .answer-section--verdict h3")).toHaveText("ฟันธงคำถามนี้");
await expect(page.locator("#ai-answer .answer-section--cards h3")).toHaveText("อ่านไพ่ทีละใบ");
await expect(page.locator("#ai-answer .answer-section--overall h3")).toHaveText("สรุปคำทำนาย");
await expect(page.locator("#ai-answer")).not.toContainText("คำแนะนำถัดไป");
await expect(page.locator("#ai-answer")).not.toContainText("คำถามชวนทบทวน");
~~~~

Add a pending-answer assertion using the existing gated member API:

~~~~js
await expect(page.locator("#tarot-waiting-ritual")).toBeVisible();
await expect(page.locator("#tarot-waiting-ritual")).toContainText("กำลังอ่านคำบนไพ่");
~~~~

- [ ] Step 2: Run focused member E2E tests and confirm RED for missing v41 behavior

Run:

    npx playwright test tests/e2e/member-ai.spec.mjs tests/e2e/guest.spec.mjs --project=desktop-chromium

Expected: only newly added v41 assertions fail; existing behavior failures must be fixed before proceeding.

- [ ] Step 3: Update result markup and copy

In ai/index.html:

- put question context immediately above result sets
- keep result controls above the answer section
- label the member action as ถามต่อ · จับไพ่ใหม่
- keep next-advice and reflection copy out of the visible answer
- keep the AI answer stage hidden for Guest

- [ ] Step 4: Make answer rendering verdict-first

In renderAnswer():

- render verdict before per-card text
- use meaning for keyword interpretation
- use prediction for direct question linkage
- render overall_prediction as final summary
- render safety_note only when present
- use text nodes for model output to avoid formatting artifacts

When structured data is missing, use a short fallback derived from the current round rather than adding another advice section.

- [ ] Step 5: Make the waiting ritual own the loading state

While answerCurrentRound() is pending:

- keep result scene visible
- keep selected cards and counters visible
- show the ritual ring and reading message
- disable only actions that would create a duplicate request
- show retry on recoverable API errors

- [ ] Step 6: Run focused and full tests

Run:

    npx playwright test tests/e2e/member-ai.spec.mjs tests/e2e/guest.spec.mjs --project=desktop-chromium
    npm test

Expected: focused E2E passes and the complete Node test suite reports zero failures.

- [ ] Step 7: Commit the result checkpoint

Run:

    git add ai/index.html ai/ai.js ai/ai.css tests/e2e/member-ai.spec.mjs tests/e2e/guest.spec.mjs
    git commit -m "feat: polish tarot result and waiting ritual"

### Task 4: Follow-up, history launchpad, and responsive polish

**Files:**
- Modify: ai/ai.js
- Modify: ai/ai.css
- Test: tests/e2e/guest.spec.mjs
- Test: tests/e2e/member-ai.spec.mjs

**Interfaces:**
- Consumes: continueReading(), startNewReading(), openHistorySession(), renderServerHistory(), and reset/delete handlers
- Produces: new-question-first follow-up, history-as-secondary-navigation, and stable mobile layout

- [ ] Step 1: Write the failing follow-up and mobile assertions

Add these assertions:

~~~~js
await page.getByRole("button", { name: /ถามต่อ.*จับไพ่ใหม่/ }).click();
await expect(page.locator("#reader-compose-view")).toBeVisible();
await expect(page.locator("#question-stage")).toBeVisible();
await expect(page.locator("#ai-question")).toHaveValue("");
await expect(page.locator("#selected-card-tray .selected-card-slot")).toHaveCount(0);
await expect(page.locator("#tarot-deck-card-list .tarot-deck-card.is-used")).toHaveCount(1);
~~~~

For the mobile project:

~~~~js
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/ai/");
await expect(page.locator("#selected-card-tray")).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
~~~~

- [ ] Step 2: Run focused tests and confirm RED

Run:

    npx playwright test tests/e2e/guest.spec.mjs tests/e2e/member-ai.spec.mjs --project=mobile-chromium

Expected: any missing tray/follow-up/mobile contract fails before implementation.

- [ ] Step 3: Keep follow-up on the compose scene

Update continueReading() to clear only current selection and question, preserve active deck session and usedDeckIndexes, preserve history/memory, set compose hash, and focus the question field for members. Do not call resetLocalDeckSession() or the server reset endpoint.

- [ ] Step 4: Keep history out of the active reading path

Style and render history as a secondary launchpad:

- keep it below the current start area
- make เริ่มดูดวงใหม่ the primary action
- open result scene only after explicit ดูย้อนหลัง
- retain one-item and all-item delete controls

- [ ] Step 5: Apply mobile layout rules

At 650px and below:

- use one column
- keep deck zone within viewport
- make selected tray horizontally scrollable if needed
- make primary action full width
- center result cards with complete aspect ratio
- preserve 44px touch targets

- [ ] Step 6: Run the full desktop/mobile E2E matrix

Run:

    npx playwright test

Expected: all guest, member-mock, scene, deck, motion, history, and mobile tests pass.

- [ ] Step 7: Commit the responsive checkpoint

Run:

    git add ai/ai.js ai/ai.css tests/e2e/guest.spec.mjs tests/e2e/member-ai.spec.mjs
    git commit -m "feat: make follow-up and mobile tarot flow clearer"

### Task 5: Verification, visual QA, and release handoff

**Files:**
- Create: docs/qa/2026-09-10-tarot-pro-ritual-report.md

**Interfaces:**
- Consumes: completed UI, local tests, and existing Vercel deployment workflow
- Produces: evidence-backed QA report and a release-ready branch without secrets

- [ ] Step 1: Run static and syntax checks

Run:

    npm run check
    git diff --check

Expected: both exit with code 0.

- [ ] Step 2: Run the complete automated suite

Run:

    npm test
    npx playwright test

Expected: zero Node test failures and zero Playwright failures.

- [ ] Step 3: Run visual smoke checks at desktop and mobile sizes

Use Playwright screenshots or the existing browser workflow at 1440x900 and 390x844. Check top hierarchy, no clipped text, no horizontal overflow, distinct selected/used/pending states, complete card images, visible loading ritual, and readable summary.

- [ ] Step 4: Run the production smoke matrix

Verify on the deployed Vercel URL:

- Guest compose and manual draw
- member login and question validation
- one, two, and three card draws
- follow-up with a new question and remaining deck
- history open/delete
- AI health check and a real benign AI answer without exposing credentials

- [ ] Step 5: Write the QA report

Record exact commands, pass counts, viewport sizes, production URL, deployment identifier, known environment notes, and rollback commit. Do not record API keys, passwords, cookies, or full AI request payloads.

- [ ] Step 6: Review the diff and commit documentation

Run:

    git status --short
    git diff --stat
    git diff --check
    git add docs/qa/2026-09-10-tarot-pro-ritual-report.md
    git commit -m "docs: record pro ritual reader QA"

- [ ] Step 7: Deploy only after verification

Promote the verified branch through the existing Vercel workflow, then repeat the production smoke matrix against the public URL. Report the public URL and evidence, not an unverified success claim.
