# Tarot Two-Scene Experience Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans when available, implementing one task at a time with review checkpoints. Track completed steps with checkboxes. User instructions take precedence; do not pause for repeated approval of already-authorized work.

**Goal:** แก้เลือก 3 ใบมืด 5 ใบ และทำประสบการณ์สองฉากที่สวย ใช้ง่าย พร้อมใช้งานจริงทั้ง Guest และ AI

**Architecture:** คง vanilla modules และ Vercel/Neon เดิม แยกสถานะสำรับออกจากสถานะฉากและการตกแต่ง การเปลี่ยนหน้าจอไม่สร้าง session หรือ draw ใหม่

**Tech Stack:** HTML, CSS perspective, JavaScript ES modules, Web Animations API, Node >=20, Vercel Functions, Neon/Postgres, node:test, Playwright

**Spec:** `docs/superpowers/specs/2026-09-10-tarot-two-scene-redesign.md` — ต้องอ่านครบก่อนลงมือ สเปกนี้มีลำดับ UI, Motion timing, ขอบเขตสองโหมดและหลักฐานบั๊ก

## คำสั่งเริ่มงานสำหรับ Luna

คุณกำลังพัฒนา repository tarot-fortune-webapp ต่อจากของเดิม อ่านสเปกและแผนนี้ครบแล้วลงมือจนถึงงานที่ตรวจสอบได้ ห้ามลบโหมด Guest หรือบังคับ login ก่อนเปิดไพ่ ห้ามเขียนเว็บใหม่ทับ login/admin/ประวัติ/Memory เดิม เริ่มแก้ state ของสำรับก่อนทำ UI แล้วทำหน้าเตรียมคำถามกับสำรับ และหน้าผลแยกฉากพร้อม Motion ตามสเปก ใช้หลักฐานทดสอบจริง รายงานสิ่งที่ทดสอบด้วย mock แยกจาก provider จริง ส่งมอบภาพ desktop/mobile, ผลเทส, commit, ลิงก์ deployment และข้อจำกัดที่เหลือ ห้ามจบงานด้วยคำว่า 100% หากยังไม่ได้ตรวจบน production

## Global constraints

- Working repo ที่พบ: `C:\Users\jo_n0\AppData\Local\Temp\tarot-fortune-webapp-redesign`; baseline `a7dd233`; remote `https://github.com/oHizokao/tarot-fortune-webapp.git` ตรวจสถานะจริงก่อนทำและเก็บงานผู้ใช้/โฟลเดอร์ `output/`
- คงสองโหมด: เปิดไพ่เองไม่ล็อกอิน; AI ต้องมี session login และสิทธิ์ฝั่ง server
- 78 ใบ ไม่ซ้ำภายในสำรับ หยิบครั้งละ 1–3 ใบจนกดล้าง; ประวัติและ Memory แยกตามบัญชี/session/round
- สเปกใหม่ supersede เทสหรือ docs เก่าที่บังคับหน้าจอเดียวแนวยาว แต่ห้ามลบเทส business rules เพื่อทำให้ผ่าน
- รอบนี้ผู้ใช้ขอแผน: เอกสารนี้ยังไม่ใช่การลงมือ deploy เมื่อผู้ใช้ส่งให้ Luna ลงมือให้ใช้ authorization ตามงานนั้น
- ห้ามนำ API key/password จากแชตมาใส่ code/docs/logs; ใช้ค่าที่ตั้งฝั่ง server อยู่แล้ว

## Task 1 — ทำบั๊ก 3 → 5 ให้เกิดซ้ำและแก้ที่การผูกตำแหน่ง

**Files:** `ai/ai.js`; create `ai/deck-visual-state.mjs`, `tests/deck-visual-state.test.mjs`; modify `tests/e2e/guest.spec.mjs`, `tests/e2e/deck-selection-member.spec.mjs`

**Interface proposed:** `commitVisualRound({sessionKey, usedIndexes, rounds}, {requestId, roundId, selectedIndexes, cards})` returns a new visual state. Validate unique integers 0..77, selected length equals cards length; repeated roundId/requestId is a no-op. Associate selected indexes to returned cards by click order. This is visual slot mapping; server still allocates unique files from its existing shuffled order and does not expose unopened faces.

- [ ] Reproduce with fresh member session and sparse positions 0,20,50, not just first three. In gated draw/answer fixture check exactly selected slot IDs, not only `.is-used` count. Existing evidence: fallback adds 0,1,2 then union becomes 0,1,2,20,50.
- [ ] Add this behavioral assertion after draw commits; retain selected IDs captured before submit:

```js
const selected = [0, 20, 50];
for (const slot of selected) await page.locator(`[data-deck-index="${slot}"]`).click();
await page.locator('#draw-button').click();
await expect(page.locator('#opened-count')).toHaveText('3');
await expect.poll(async () => page.locator('.tarot-deck-card.is-used')
  .evaluateAll(nodes => nodes.map(n => Number(n.dataset.deckIndex)).sort((a,b) => a-b)))
  .toEqual(selected);
await expect(page.locator('#remaining-count')).toHaveText('75');
```

- [ ] Run test before fix and retain the failure evidence. Include selection [10,30,70] where current fallback can make six dark slots.
- [ ] Initialize/bind visual state when new session is created while count is zero. Snapshot selected indexes/request ID before any await. Commit once only after draw succeeds. `applyServerSession` must not synthesize new used slots for a draw in progress.
- [ ] Extract deterministic visual commit/derive logic. Remove routine `Array.from({length:openedCount})` position inference. No animation/render function may mutate used state.
- [ ] Add unit assertions: commit 3 sparse indexes yields exactly 3; repeat same round leaves 3; next round 2 yields 5; duplicate/used/out-of-range selected slots reject; known empty saved array is a valid empty value, not missing.
- [ ] Verify first member round and first guest round plus second round. Commit fix independently before redesign.

## Task 2 — Persist mapping and make pending/retry counters consistent

**Files:** `ai/deck-session.mjs`, `ai/ai.js`, `ai/deck-visual-state.mjs`, `lib/vercel/routes/ai.mjs`, `lib/vercel/readings.mjs`, `database/schema.vercel.sql`, `scripts/migrate.mjs`; create `database/migrations/003_reading_round_visual_slots.sql`; tests `tests/continuous-deck.test.mjs`, `tests/database-migrations.test.mjs`, `tests/deck-visual-state.test.mjs`

**Contract:** add `selected_indexes` (1–3 unique integer slots 0..77) to draw payload; returned normalized round includes it. Add nullable `selected_indexes JSONB` to reading_rounds. No full deck faces/order returned. Older clients without indexes remain supported using one server-generated mapping committed once, never browser fallback union.

- [ ] Add additive migration and schema entry, verify migration runner actually includes it. Existing history rows remain valid with null mapping.
- [ ] Validate selection length equals count, ownership and previously used slots; persist selected indexes in the same existing draw transaction/row-lock/idempotency flow as cards. Check request replay first: same request ID returns previous round; reject ID reuse with changed payload. Use existing shuffled draw order unchanged.
- [ ] Persist guest per-round selectedIndexes in local normalized session; normalization must preserve them. Add storage version migration without deleting history.
- [ ] Legacy sessions: prefer exact saved visual mapping only when its valid unique length equals committed count. If exact positions never existed, allocate legacy slots once in deterministic order across rounds, mark migration complete, and reserve any known mappings first. Do not claim reconstructed locations are original click positions. Never append synthetic slots while committing current selection.
- [ ] Counts use committed state plus a separate pending label. On draw success apply server count and clear pending in one render transaction. Keep counts visible in both A and B (including waiting); update the previous optimistic test intentionally to the new explicit pending semantics.
- [ ] Persist pending request ID and frozen payload until resolved; after an uncertain draw timeout retry/reconcile the same request, never call randomId again for that logical draw. Definitive failure clears pending without consuming cards. AI answer failure keeps the committed round and retries answer only.
- [ ] Test pending then success (0/78 → 3/75 once); timeout after server commit and retry (still 3/75); AI 429/failure then retry (no new draw); final 1/2 cards; concurrent requests cannot reuse slots; restore account/session isolation. Commit after these pass.

## Task 3 — Replace scrolling sections with two explicit views

**Files:** `ai/index.html`, `ai/ai.js`; create `ai/reader-navigation.mjs`; update `tests/two-mode-foyer.test.js`, `tests/smooth-ui-full-card-ai.test.js`; create `tests/e2e/reader-scenes.spec.mjs`

**Interface:** `setReaderView(view, {roundId, historyMode, replace})`, view is `compose` or `result`; draw/answer phases are separate state. Compose hash `#question-title`, result hash `#reading-result` retained for existing links. Store selected round ID in history state, persist round by session/account for refresh; hash alone is not a request to draw.

- [ ] Create `[data-reader-view="compose"]` containing one question field, deck, counters, main CTA; `[data-reader-view="result"]` containing revealed cards, answer/loading/error, counters and continuation. Wrap existing sections once and reuse valid IDs where possible.
- [ ] Centralize hidden/inert state so only one view is visible and keyboard-focusable. `setReaderView` never calls draw/answer/reset. Browser Back/Forward only navigates, focus moves to destination heading. Hide old duplicate hero/banner/steps and remove obsolete selectors rather than stacking CSS overrides.
- [ ] On valid predict start transition to result preparation; draw success populates cards; request AI once. Draw failure returns to compose with original question/selection and inline error. AI failure stays on result with retry.
- [ ] Fresh login opens compose ready; historical result opens in history context without overwriting active session. Refresh result resolves saved committed round, never re-POSTs draw; absent result redirects compose with short status.
- [ ] E2E: result visible AND compose hidden after predict; Back/Forward and refresh preserve counts; invalid/empty question does not send API; guest still works; login does not auto-show old reading. Commit.

## Task 4 — Design the question + deck scene and accurate interaction

**Files:** `ai/index.html`, `ai/ai.css`, `ai/ai.js`; create `ai/deck-scene.mjs`

**Interface:** `mountDeckScene(root, {onToggleSlot})` returns `{render({selectedIndexes,usedIndexes,busy}),destroy()}`. render is read-only to session. Each visual card has stable `data-deck-index` 0..77 and button/pressed accessibility semantics. All 78 slots persist through rotation and rounds.

- [ ] Implement spec A layout: centered compact question, large deck, counters and one main CTA; compact mode toggle/header; history behind a clear action. Guest question area absent, AI question first.
- [ ] Use CSS perspective ring/ribbon and pointer drag rotation. Keep face-down card ratio around 2:3 and actual output ratio from original files. Front-facing hit area >=44×44px; behind-surface slots cannot intercept taps; pointer movement >8px is drag, not selection; vertical touch scroll remains usable.
- [ ] Rotation identity is slot ID, never visible array index after sorting. Select toggles up to 3; selected glow with 1/2/3; temporary locked gray distinct from permanently used dark. Cancelling selected slot re-enables remaining immediately and renumbers selection.
- [ ] Implement responsive spacing and interaction at 360/390/768/1440 widths. On narrow screens show a clear front arc and allow drag to reach all remaining slots; do not shrink all 78 into tiny unusable buttons. Optional keyboard-accessible expanded deck uses same state if needed for complete access.
- [ ] Verify sparse selection after rotation, deselection, maximum 3, used slots cannot be selected, drag cannot select, no horizontal page overflow. Save screenshots of empty/1 selected/3 selected/used state. Commit.

## Task 5 — Card-first result and tasteful motion

**Files:** `ai/ai.css`, `ai/ai.js`, `ai/index.html`; create `ai/reader-motion.mjs`; update `tests/e2e/reader-scenes.spec.mjs`

**Interface:** `playReveal(elements, {signal,reducedMotion})` returns a promise that always settles on completion/cancel; `setWaiting(root, waiting)` controls only loader; no network requests or used-slot mutations here.

- [ ] Build spec B result from one committed round: question, 1–3 complete images, title/short meaning/prediction under each, summary below, continuation. Use existing structured result fields `cards`, `meaning`, `prediction`, `overall_prediction`; avoid duplicate verdict headline + duplicate summary + repeated card inventory.
- [ ] Large image column(s) desktop; stacked readable image/text units mobile. Render untrusted answer as text through existing safe renderer. Missing/incomplete answer shows explicit retry, not fake fulfilled state. Historical formats stay readable.
- [ ] Add ambient stars/soft rotating sigil and restrained depth behind deck. Implement exact durations from spec; decouple per-card flip transform from deck layout transform using nested wrappers. Stable text after animation.
- [ ] Visible waiting state `กำลังอ่านคำทำนาย…`, committed counts, API error state and retry. API may finish before or after flip; settle both orders without replaying draw/flip indefinitely. Route changes cancel old animations and guard stale responses by requestVersion.
- [ ] No motion toggle; reduced-motion uses soft fade/glow; suspend hidden-tab loops. Every animation has cleanup; no re-created intervals/listeners per render.
- [ ] Browser test samples transforms at different timestamps for ambient/reveal, confirms loader appears under gated API and disappears on success/error, screenshot verifies full card image and unclipped Thai text at 360 and 1440. Commit.

## Task 6 — Continue from same deck, history, and recovery

**Files:** `ai/ai.js`, `ai/reader-navigation.mjs`, `ai/index.html`, `ai/ai.css`; tests `tests/e2e/guest.spec.mjs`, `tests/e2e/reader-scenes.spec.mjs`

- [ ] Main result button `ถามต่อ · จับไพ่ใหม่` returns compose, clears only draft question/selection, focuses existing top question field, keeps session/used slots/previous rounds in Memory. Guest uses `จับไพ่ต่อ`.
- [ ] Reset action creates fresh 78-card deck and new conversation scope. Preserve previous readings in history. Pending request handling must invalidate stale responses, and reset must not accidentally revive old deck.
- [ ] History open closes via return-to-active action; deletion of one/all history retains original confirmation behavior and server ownership checks. Use dedicated mock test data for delete tests, not actual user's history.
- [ ] Verify one follow-up new question produces exactly one new draw and answer, has prior context server-side but answers latest question; 3 then 2 yields 5 used/73 left at the correct slots. Verify logout clears private UI/storage scope and preserves free-mode ability.
- [ ] Preserve existing Copy/download behavior and old public entry points, login/admin pages. Commit.

## Task 7 — Release verification and handoff

**Files:** `tests/e2e/reader-scenes.spec.mjs`, existing relevant tests, `ai/index.html`; create `docs/qa/2026-09-10-tarot-two-scene-report.md`

- [ ] Run commands below after integration; record actual totals and failures. Update tests asserting superseded text/layout without removing business assertions. Do not keep retrying flaky tests until green; fix the cause.

```powershell
npm test
npm run check
npx playwright test tests/e2e/guest.spec.mjs tests/e2e/deck-selection.spec.mjs tests/e2e/deck-selection-member.spec.mjs tests/e2e/reader-scenes.spec.mjs
git diff --check
```

- [ ] Required QA scenarios: guest without login, authorized member, pending member; sparse picks [0,20,50] and [10,30,70]; 1/2/3 selection; 3+2 cumulative; all 78 unique; last 1/2 remaining; cancel selection; answer pending; error/retry; duplicate click; request timeout after commit; refresh/Back/Forward; fresh login/history restore; account isolation; reset; history delete one/all using fixtures.
- [ ] Visual evidence desktop 1440×900 and mobile 390×844 plus narrow 360: compose with 3 selected, result waiting, result success, second round used slots. Check Thai text, natural images, selected/dim distinction, CTA reach, keyboard focus, touch drag, reduced-motion. Keep proof under a new QA subfolder; do not overwrite existing output.
- [ ] Bump asset versions once at release after final edits. Validate additive migration on test/staging DB before production. Inspect git diff for secrets and unrelated files, commit only task files.
- [ ] When implementation is authorized for release: use existing GitHub → Vercel workflow, deploy migration before new contract consumers, confirm production serves new HTML/CSS/JS. Keep compatibility with previous frontend during rollout. Do not push to main without completing checks.
- [ ] Smoke-test actual deployed Guest and authorized test member. One real provider question plus one follow-up must return readable answers tied to the cards. If API billing/key/provider availability blocks this, report precise error with no secret values; do not say AI passed based on mocked network.
- [ ] QA report includes baseline/final commits, files, migration, screenshots/video, local vs production test evidence, real provider result, limitations, and rollback commit. Prefer revert code to destructive DB rollback; additive nullable column can remain.

## Final review checklist for Luna

- [ ] Selecting three arbitrary slots makes exactly those three used after commit, never five/six.
- [ ] Temporary gray selection lock is distinguishable from dark previously used cards and unlocks correctly.
- [ ] Question/deck and result are separate visible scenes; no hidden focusable controls.
- [ ] Main flow needs only question, 1–3 card taps, predict; no second ask button to get the initial AI answer.
- [ ] Result images are dominant, full-size and uncropped; text reads naturally on mobile.
- [ ] Motion is visible and helps transitions without blocking input, obscuring text, or triggering another draw.
- [ ] Follow-up draws new cards from same deck, keeps Memory; reset alone creates a new deck scope.
- [ ] Both modes, login/admin, history and existing exports remain functional.
- [ ] Claims of production readiness match recorded real tests.
