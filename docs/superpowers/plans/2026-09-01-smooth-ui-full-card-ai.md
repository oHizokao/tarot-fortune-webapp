# Smooth UI, Full Card, and AI Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tarot Daily reading flow sequential and readable, show the full tarot artwork, and provide an honest retry path for AI provider failures.

**Architecture:** Preserve the existing static Vercel routes and server-side auth/reading APIs. Make the AI page a single sequential reading rail, use the real card aspect ratio instead of cropping, and keep the provider error contract while improving its visible recovery state. Keep root, login, and admin pages on the same spacing rhythm without moving route responsibilities.

**Tech Stack:** Static HTML, CSS, ES modules, Node built-in test runner, Playwright, existing Vercel Node APIs.

**Spec:** `docs/superpowers/specs/2026-09-01-smooth-ui-full-card-ai-design.md`

## Global Constraints

- The AI order is exactly “01 พิมพ์คำถาม → 02 เลือกจำนวนไพ่ → 03 เปิดไพ่ → 04 รับคำตอบ”.
- Guest mode does not require login and keeps its no-duplicate 78-card deck behavior.
- Full card images preserve the 448:800 source ratio and never use `object-fit: cover`.
- API keys, passwords, and AI responses are never placed in browser storage.
- A real OpenAI 429 remains an actionable error; the UI must not invent an answer.
- No horizontal overflow at 390px, 768px, or 1440px; reduced-motion behavior remains supported.

---

### Task 1: Add failing regression contracts for the requested fixes

**Files:**
- Create: `tests/smooth-ui-full-card-ai.test.js`
- Modify: `tests/two-mode-foyer.test.js`
- Modify: `tests/e2e/guest.spec.mjs`

**Interfaces:**
- `ai/index.html` exposes a sequential reading rail and full-card image hook.
- `ai/ai.css` exposes a final full-card image rule and a non-stretched sequential layout rule.
- The existing client error copy keeps `AI_RATE_LIMITED` actionable.

- [ ] **Step 1: Write the failing contract tests**

```js
test("AI card images preserve the complete source card", () => {
  assert.match(css, /\.tarot-card-card img[^}]*object-fit:\s*contain/);
  assert.match(css, /\.tarot-card-card img[^}]*aspect-ratio:\s*448\s*\/\s*800/);
});

test("AI reader declares one sequential member rail", () => {
  assert.match(html, /class="ai-reading-stage[^\"]*ai-reading-stage--sequential/);
  assert.match(html, /data-reader-order="question spread reveal answer"/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/smooth-ui-full-card-ai.test.js`

Expected: FAIL because the new class/order hook and contain/full-ratio rule do not exist yet.

- [ ] **Step 3: Add a browser assertion for full-card layout**

Extend `tests/e2e/guest.spec.mjs` to open one guest card, inspect the first AI card image, and assert `object-fit === "contain"`, `naturalWidth > 0`, and the rendered image ratio is within 0.08 of `448 / 800`.

- [ ] **Step 4: Run the focused browser assertion and verify it fails**

Run: `npx playwright test tests/e2e/guest.spec.mjs --project=desktop-chromium --grep "full card"`

Expected: FAIL on the current `cover` rule.

### Task 2: Refactor the AI reading rail without changing state or API contracts

**Files:**
- Modify: `ai/index.html`
- Modify: `ai/ai.css`
- Modify: `ai/ai.js`
- Modify: `tests/smooth-ui-full-card-ai.test.js`

**Interfaces:**
- Keep `#ai-question`, `#draw-button`, `#ask-ai-button`, `#cards-grid`, `#memory-status`, and `#new-reading-button` unchanged.
- Keep `drawCards`, `ensureReading`, and `askAi` using the existing API URLs and server-side Memory.

- [ ] **Step 1: Add the approved order hooks to the reading stage**

Add `ai-reading-stage--sequential` and `data-reader-order="question spread reveal answer"` to the stage. Keep the guest mode selector and the four existing section IDs so the controller and tests remain compatible.

- [ ] **Step 2: Replace the final grid override with the sequential desktop layout**

Use one content column for the question, spread, reveal, and answer sections. Use a restrained two-column sub-layout only inside the spread controls when the viewport has room. Remove equal-height/stretch behavior and keep each stage’s margin/padding consistent.

- [ ] **Step 3: Make the mobile layout follow the same order**

At 900px and below, set one column in the same sequence. At 650px and below, keep the action buttons full width and prevent the flow rail, headings, and card gallery from overflowing.

- [ ] **Step 4: Keep client state behavior unchanged and improve status wording**

Do not redraw on an AI retry. Preserve `state.failedQuestion`, the current `state.drawn`, `state.readingId`, and the Memory object. Make the status distinguish “กำลังเชื่อมต่อ AI” from “โควตา OpenAI ยังไม่พร้อม” while retaining the existing retry button.

- [ ] **Step 5: Run focused client and contract tests**

Run: `node --test tests/smooth-ui-full-card-ai.test.js tests/ai-question-visibility.test.js tests/ai-memory-ui.test.js && node --check ai/ai.js`

Expected: PASS.

### Task 3: Render every card at its full source ratio

**Files:**
- Modify: `ai/ai.css`
- Modify: `ai/ai.js`
- Modify: `tests/smooth-ui-full-card-ai.test.js`

**Interfaces:**
- Card files remain `../tarot-cards/card-###.webp`.
- `createCardElement()` remains responsible for alt text, eager/lazy loading, and card reveal delay.

- [ ] **Step 1: Add the failing ratio/contain assertions**

Assert that the final card image rule contains `aspect-ratio: 448 / 800`, `height: auto`, and `object-fit: contain`, and that the card shell does not hide image overflow.

- [ ] **Step 2: Implement the minimal full-card rule**

Set the image width to 100%, height to auto, aspect ratio to 448/800, and `object-fit: contain`. Use `overflow: visible` on the card shell only when required by the reveal effect; keep the image itself inside a rounded clipping wrapper if the shine animation needs clipping.

- [ ] **Step 3: Resize the witch scene to supporting art**

Reduce the final witch scene height and let the card gallery use the available width. The art remains decorative and `aria-hidden`; the card title/meta stays below the complete image.

- [ ] **Step 4: Run the focused ratio tests and browser test**

Run: `node --test tests/smooth-ui-full-card-ai.test.js && npx playwright test tests/e2e/guest.spec.mjs --project=desktop-chromium --grep "full card"`

Expected: PASS.

### Task 4: Verify and document the real AI provider failure path

**Files:**
- Modify: `lib/client/error-copy.js`
- Modify: `ai/ai.js`
- Modify: `admin/admin.js`
- Modify: `tests/openai-production.test.mjs`
- Modify: `tests/smooth-ui-full-card-ai.test.js`

**Interfaces:**
- Preserve `AI_RATE_LIMITED`, `OPENAI_NOT_CONFIGURED`, `MODEL_UNAVAILABLE`, `AI_TIMEOUT`, and `AI_UPSTREAM_ERROR` codes.
- Preserve Admin’s server-side encrypted API key setting and connection-test endpoint.

- [ ] **Step 1: Add a failing client contract for quota recovery**

Assert that `AI_RATE_LIMITED` copy names OpenAI quota/credit and tells the user to retry after fixing Billing/Usage, while the question remains available for retry.

- [ ] **Step 2: Implement the actionable failure copy and retry state**

Keep the original question and cards in the UI, show a retry button for transient/provider errors, and avoid clearing the question until a successful response. Keep the Admin connection test’s error message aligned with the same cause.

- [ ] **Step 3: Run unit tests with the existing 429 response fixture**

Run: `node --test tests/openai-production.test.mjs tests/smooth-ui-full-card-ai.test.js`

Expected: PASS; the 429 fixture still maps to `AI_RATE_LIMITED`.

- [ ] **Step 4: Run one production member smoke**

Run with the configured smoke credentials in environment variables only: `BASE_URL=https://tarot-daily-78-history.vercel.app E2E_TEST_USERNAME=<configured username> E2E_TEST_PASSWORD=<configured password> npx playwright test tests/e2e/member-ai.spec.mjs --project=desktop-chromium --workers=1`.

Expected: login and reading creation pass. If the provider still returns 429, the test records that external prerequisite explicitly; it is not converted into a fake answer.

### Task 5: Apply the shared spacing rhythm to customer pages

**Files:**
- Modify: `style.css`
- Modify: `ai/ai.css`
- Modify: `login/login.css`
- Modify: `admin/admin.css`
- Modify: `tests/smooth-ui-full-card-ai.test.js`

**Interfaces:**
- Keep all current route URLs and IDs.
- Do not move admin-only controls into customer pages or expose admin labels in customer navigation.

- [ ] **Step 1: Add a failing responsive contract**

Assert that the four page styles define the same narrow shell width token and that the AI mobile rail remains single-column.

- [ ] **Step 2: Normalize only spacing and hierarchy**

Use shared values for shell width, topbar padding, heading-to-copy spacing, and section gaps. Remove only conflicting late overrides that create oversized empty regions; leave feature-specific colors and controls intact.

- [ ] **Step 3: Run desktop and mobile screenshots**

Run the Playwright guest suite at the configured desktop and mobile projects, then inspect screenshots at 390px and 1440px for clipping, order, focus visibility, and horizontal overflow.

### Task 6: Full verification and release

**Files:**
- Modify: `ai/index.html`
- Modify: `index.html`
- Modify: `tests/two-mode-foyer.test.js`
- Modify: `docs/runbooks/witch-two-modes-launch.md`

- [ ] **Step 1: Bump cache versions after code is green**

Change the AI CSS/JS query string from `v8` to `v9` only after the focused tests pass, and update the asset-version contract.

- [ ] **Step 2: Run the complete local verification**

Run: `npm test && npm run check && npx playwright test`

Expected: zero failed tests; member smoke may skip only when credentials are not configured locally.

- [ ] **Step 3: Check the diff and route assets**

Run: `git diff --check`, verify `tarot-cards/card-001.webp` is 448×800 through browser metadata, and run `git status --short`. Never stage `output/` or test artifacts.

- [ ] **Step 4: Deploy and smoke production**

Push the verified branch and `main`, wait for Vercel deployment, check `/`, `/ai/`, `/login/`, `/admin/`, `/api/health`, guest reading, and member login. Record the actual AI provider result.

- [ ] **Step 5: Commit the verified change**

```powershell
git add ai index.html style.css login admin lib tests docs/superpowers
git commit -m "fix: smooth tarot layout and show full cards"
```
