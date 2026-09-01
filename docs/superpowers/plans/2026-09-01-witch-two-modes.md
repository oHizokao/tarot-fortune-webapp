# Witch Tarot Two-Mode Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe Tarot Daily as a clear two-mode tarot experience with a guest self-reading foyer and an authenticated, question-first AI witch reader.

**Architecture:** Keep the existing static Vercel routes and production APIs. Refactor the root customer page into a two-mode foyer with the manual reader below it, then reorder and restyle `/ai/` into a guided question-first scene while preserving its server-side Memory and auth contracts. Add a compressed original witch illustration as a decorative layer and test behavior through Node contract tests plus Playwright desktop/mobile smoke flows.

**Tech Stack:** Static HTML, CSS, ES modules, browser LocalStorage/SessionStorage, existing Vercel API routes, Node built-in test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-witch-two-modes-design.md`

## Global Constraints

- The root page is a two-mode foyer with `#manual-reader` and `/ai/` as the two primary actions.
- Manual mode is usable without login and keeps the no-duplicate 78-card deck contract.
- AI mode visibly follows “01 พิมพ์คำถาม → 02 เลือกจำนวนไพ่ → 03 เปิดไพ่ → 04 รับคำตอบ”.
- Authenticated AI Memory remains server-side; API keys, passwords, and AI responses are never put into browser storage.
- Existing `/login/`, `/admin/`, `/api/auth/*`, `/api/admin/*`, `/api/ai/*`, `/privacy/`, and `/terms/` route contracts remain compatible.
- The experience must have no horizontal overflow at 390px, 768px, and 1440px widths.
- `prefers-reduced-motion: reduce` must remove non-essential animation while preserving state changes and focus behavior.
- Use the existing tarot card assets in `tarot-cards/`; generated artwork is additive only.

---

### Task 1: Lock the foyer and route contracts with failing tests

**Files:**
- Modify: `tests/ai-question-visibility.test.js`
- Modify: `tests/ai-memory-ui.test.js`
- Modify: `tests/e2e/guest.spec.mjs`
- Create: `tests/two-mode-foyer.test.js`

**Interfaces:**
- The root HTML must expose `#mode-foyer`, `#manual-mode-link`, and `#ai-mode-link`.
- The AI HTML must expose `.ai-question-stage` before `.ai-spread-stage` in document order.

- [ ] **Step 1: Write the failing contract tests**

```js
test("root exposes distinct guest and AI mode actions", () => {
  assert.match(html, /id="mode-foyer"/);
  assert.match(html, /id="manual-mode-link"/);
  assert.match(html, /id="ai-mode-link"/);
  assert.match(html, /href="\.\/ai\//);
});

test("AI page puts the question stage before the spread stage", () => {
  assert.ok(html.indexOf("ai-question-stage") < html.indexOf("ai-spread-stage"));
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/two-mode-foyer.test.js tests/ai-question-visibility.test.js tests/ai-memory-ui.test.js`

Expected: FAIL because the new foyer and stage hooks are not present.

- [ ] **Step 3: Commit the red tests**

```powershell
git add tests/two-mode-foyer.test.js tests/ai-question-visibility.test.js tests/ai-memory-ui.test.js tests/e2e/guest.spec.mjs
git commit -m "test: define two-mode tarot experience contracts"
```

### Task 2: Build the root two-mode foyer while preserving manual reading

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`
- Modify: `tests/two-mode-foyer.test.js`

**Interfaces:**
- `app.js` continues to own manual deck/history/copy state.
- `app.js` must not require the removed root AI preview elements.

- [ ] **Step 1: Implement the foyer markup and manual-mode anchor**

```html
<section class="mode-foyer" id="mode-foyer" aria-labelledby="mode-title">
  <p class="eyebrow">CHOOSE YOUR READING</p>
  <h1 id="mode-title">วันนี้อยากให้ไพ่<br /><span>ช่วยคุณแบบไหน?</span></h1>
  <div class="mode-choices">
    <a id="manual-mode-link" class="mode-card mode-card--manual" href="#manual-reader">เปิดไพ่ด้วยตัวเอง<span>ไม่ต้องล็อกอิน · อ่านความหมายด้วยตัวคุณ</span></a>
    <a id="ai-mode-link" class="mode-card mode-card--ai" href="./ai/">ถามแม่มด AI<span>เข้าสู่ระบบ · ให้ AI เชื่อมคำบนไพ่กับคำถาม</span></a>
  </div>
</section>
```

- [ ] **Step 2: Add the manual section target and remove the mixed AI preview**

Move the existing manual workspace/history under a `section` with `id="manual-reader"`, replace the mixed root AI preview with a compact cross-link to `/ai/`, and keep the existing IDs used by `app.js` for manual controls.

- [ ] **Step 3: Make optional AI DOM access safe**

Guard any root-only AI listener and renderer in `app.js` so a foyer page with no AI preview never throws during startup. Manual controls must still initialize when the AI elements are absent.

- [ ] **Step 4: Add responsive foyer styling**

Use a central witch/orb scene, two high-contrast mode cards, keyboard focus states, and a mobile single-column layout. Keep the manual reader below the foyer and make the “เปิดไพ่ด้วยตัวเอง” link scroll to it.

- [ ] **Step 5: Run the root contract and syntax tests**

Run: `node --test tests/two-mode-foyer.test.js tests/mobile-layout.test.js && node --check app.js`

Expected: PASS with no startup null-reference errors.

### Task 3: Reorder AI into a question-first witch reading stage

**Files:**
- Modify: `ai/index.html`
- Modify: `ai/ai.css`
- Modify: `ai/ai.js`
- Modify: `tests/ai-question-visibility.test.js`
- Modify: `tests/e2e/guest.spec.mjs`

**Interfaces:**
- Keep `#ai-question`, `#draw-button`, `#ask-ai-button`, `#cards-grid`, `#memory-status`, `#new-reading-button`, and existing API calls.
- `drawCards()` must continue to reject an empty question and must not consume cards when validation fails.

- [ ] **Step 1: Reorder the DOM into question, spread, reveal, answer stages**

Place the flow rail and question textarea in `.ai-question-stage`, place count/progress controls in `.ai-spread-stage`, and place the cards in `.ai-reveal-stage`. Keep the IDs unchanged so the existing controller remains compatible.

- [ ] **Step 2: Add the witch scene and explicit stage copy**

Add a `.witch-scene` with a decorative artwork image, crystal-ball glow, and a live status label that changes from “กำลังเตรียมสำรับ” to “แม่มดกำลังอ่านไพ่” to “คำตอบพร้อมแล้ว”. The artwork is `aria-hidden` and all instructions remain text-based.

- [ ] **Step 3: Update controller state labels and focus behavior**

Update `renderFlow`, `renderProgress`, `renderCards`, and `askAi` copy to use the four visible stages. Keep the question draft on API failure, focus `#ai-answer-title` after success, and leave the same reading ID/cards intact for follow-ups.

- [ ] **Step 4: Add responsive and reduced-motion CSS**

Desktop uses a two-column scene with question/actions adjacent to the witch; mobile stacks question → count → draw → cards → answer, keeps the main action full width, and removes oversized hero padding. Reduced motion sets reveal transforms to final state.

- [ ] **Step 5: Run focused AI tests and syntax checks**

Run: `node --test tests/ai-question-visibility.test.js tests/ai-memory-ui.test.js tests/ai-workflow.test.mjs && node --check ai/ai.js`

Expected: PASS.

### Task 4: Add and optimize the original witch artwork

**Files:**
- Create: `assets/witch/witch-reader.webp`
- Modify: `ai/index.html`
- Modify: `ai/ai.css`
- Modify: `.vercelignore`

**Interfaces:**
- The image is decorative, has no text baked into it, and is referenced only from the AI page.

- [ ] **Step 1: Generate one original web hero illustration**

Use the built-in image generation workflow with a transparent or scene-compatible background, a friendly cartoon witch at a tarot table, crystal ball, indigo/purple/gold palette, no words, no logos, and a composition that leaves the center card area visually usable.

- [ ] **Step 2: Copy the selected asset into `assets/witch/witch-reader.webp`**

Inspect the generated image, convert/compress it to WebP if needed, and verify it opens with a browser-compatible MIME type. Keep the source image non-destructive outside the tracked final asset.

- [ ] **Step 3: Wire preload/lazy behavior**

Preload only this AI-scene asset on `ai/index.html`; keep tarot card images eager only when they are part of the active spread.

- [ ] **Step 4: Run asset and HTML contract checks**

Run: `node --test tests/ai-memory-ui.test.js tests/two-mode-foyer.test.js && node --check ai/ai.js`

Expected: PASS and the asset path exists.

### Task 5: Add end-to-end two-mode desktop/mobile coverage

**Files:**
- Modify: `tests/e2e/guest.spec.mjs`
- Modify: `tests/e2e/member-ai.spec.mjs`
- Modify: `playwright.config.mjs`

**Interfaces:**
- Tests use existing local static server and optional `E2E_TEST_USERNAME`/`E2E_TEST_PASSWORD` for member coverage.

- [ ] **Step 1: Add foyer and guest manual flows**

```js
test("guest sees two distinct modes and can open manual cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#manual-mode-link")).toContainText("เปิดไพ่ด้วยตัวเอง");
  await expect(page.locator("#ai-mode-link")).toContainText("ถามแม่มด AI");
  await page.locator("#manual-mode-link").click();
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
});
```

- [ ] **Step 2: Add AI question-first and mobile layout checks**

Verify the question field is visible before the card grid, empty question keeps the draw button disabled, a real question enables it, and the page has no horizontal overflow in the mobile project.

- [ ] **Step 3: Keep the member Memory smoke flow**

Use the existing login flow, verify the first answer appears, ask a follow-up with the same cards, and verify the Memory label indicates the original topic.

- [ ] **Step 4: Run the full local browser suite**

Run: `npm run test:e2e`

Expected: guest desktop/mobile tests pass; member test is skipped only when test credentials are not configured.

### Task 6: Full verification, review, and release preparation

**Files:**
- Modify: `README.md`
- Create: `docs/runbooks/witch-two-modes-launch.md`

**Interfaces:**
- The runbook lists exact local and Vercel checks without including secrets.

- [ ] **Step 1: Run unit/contract tests and syntax checks**

Run: `npm test && npm run check`

- [ ] **Step 2: Run the browser suite at desktop and mobile sizes**

Run: `npm run test:e2e`

- [ ] **Step 3: Inspect the final diff and check for regressions**

Run: `git diff --check` and `git status --short`. Confirm no user-owned untracked assets outside the feature are staged.

- [ ] **Step 4: Write the launch runbook**

Document: `npm ci`, `npm test`, `npm run check`, `npm run test:e2e`, Vercel preview review, production smoke of `/`, `/ai/`, `/login/`, `/admin/`, and rollback to the previous Vercel deployment. Never document API keys or passwords.

- [ ] **Step 5: Commit the verified feature**

```powershell
git add index.html style.css app.js ai assets tests README.md docs/runbooks/witch-two-modes-launch.md .vercelignore
git commit -m "feat: redesign tarot into two guided reading modes"
```

