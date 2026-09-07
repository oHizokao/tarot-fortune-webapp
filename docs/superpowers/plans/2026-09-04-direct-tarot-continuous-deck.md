# Direct Tarot Reading and Continuous Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยน Tarot Daily ให้ตอบคำถามแบบคำทำนายที่ฟันธงชัด และเปิดไพ่ต่อจากสำรับเดิมหลายรอบจนกดล้างไพ่

**Architecture:** สมาชิกมี deck session เดียวที่เก็บลำดับสำรับและมี `reading_rounds` หลายรอบอยู่ข้างใน การตัดไพ่ทำใน transaction และคำตอบ AI ใช้ Structured Outputs เพื่อแยกคำฟันธง ไพ่รายใบ และคำทำนายรวม ผู้ใช้ทั่วไปใช้ shape เดียวกันใน localStorage

**Tech Stack:** Vercel Node functions, Neon/Postgres, vanilla ES modules, OpenAI Responses API, Node test runner, Playwright

**Spec:** `docs/superpowers/specs/2026-09-04-direct-tarot-continuous-deck-design.md`

## Global Constraints

- ไพ่ต้องไม่ซ้ำภายในสำรับ 78 ใบ และการตัดไพ่ต้อง atomic
- กด “ล้างไพ่และสับใหม่” เท่านั้นที่เริ่มสำรับใหม่และล้าง Memory ของเรื่องปัจจุบัน
- โหมดไม่ล็อกอินต้องเปิดไพ่เองต่อได้โดยไม่เรียก AI
- โหมดสมาชิกต้องบังคับลำดับ พิมพ์คำถาม → เลือกไพ่ → เปิดไพ่ → รับคำตอบ
- คำตอบทั่วไปต้องมี `คำฟันธง` และตอบคำถามล่าสุดก่อนบริบทเก่า
- ห้ามแสดง section `คำแนะนำถัดไป` และ `คำถามชวนทบทวน`
- API key อยู่ฝั่ง server/ฐานข้อมูลเท่านั้น ไม่ใส่ใน frontend หรือ test fixture
- ต้องรักษาข้อมูล reading รุ่นเก่าให้อ่านย้อนหลังได้

---

### Task 1: Lock the direct tarot answer contract

**Files:**
- Modify: `lib/vercel/settings.mjs`
- Modify: `lib/vercel/openai.mjs`
- Test: `tests/prompt-settings.test.mjs`
- Test: `tests/vercel-api.test.mjs`

**Interfaces:**
- Produce `TAROT_ANSWER_SCHEMA` for Responses API `text.format`
- Produce `parseTarotAnswer(value)` returning `{ verdict, cards, overall_prediction, safety_note }` or throwing `EMPTY_AI_RESPONSE`
- Keep `createTarotResponse()` returning the existing `answer` string for compatibility, while adding normalized structured data

- [ ] **Step 1: Write failing tests for the answer contract**

Add assertions that the default prompt requires a first-line verdict, prohibits ordinary evasive wording, and requires one card entry per opened card. Add a mocked Responses payload containing JSON and assert `parseTarotAnswer()` returns the four required fields.

```js
assert.match(DEFAULT_TAROT_PROMPT, /คำฟันธง/);
assert.match(TAROT_RESPONSE_FORMAT, /คำทำนายโดยรวม/);
assert.equal(parseTarotAnswer(JSON.stringify({ verdict: "ควรไปต่อ", cards: [], overall_prediction: "เดินหน้าได้", safety_note: "" })).verdict, "ควรไปต่อ");
```

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run: `node --test tests/prompt-settings.test.mjs tests/vercel-api.test.mjs`

Expected: FAIL because `TAROT_ANSWER_SCHEMA` and `parseTarotAnswer` do not exist and the prompt has no enforced verdict contract.

- [ ] **Step 3: Implement the schema and normalizer**

Define a strict object schema with `verdict`, `cards`, `overall_prediction`, and `safety_note`; each card item requires `position`, `name`, `meaning`, and `prediction`. Normalize all fields to bounded strings, reject an empty verdict or no overall prediction, and format the normalized object into:

```text
คำฟันธง: {verdict}
ไพ่ใบที่ {position} — {name}
ความหมายของไพ่: {meaning}
คำทำนาย: {prediction}
คำทำนายโดยรวม: {overall_prediction}
```

Update the prompt so ordinary readings are direct and the safety note is only used for high-risk questions.

- [ ] **Step 4: Configure the Responses request and verify green**

Pass `text: { format: { type: "json_schema", name: "tarot_reading", strict: true, schema: TAROT_ANSWER_SCHEMA } }` to the tarot request, keep the connection test as plain text, parse `output_text`, and run:

Run: `node --test tests/prompt-settings.test.mjs tests/vercel-api.test.mjs`

Expected: all focused prompt/API tests pass.

- [ ] **Step 5: Commit the answer contract**

```bash
git add lib/vercel/settings.mjs lib/vercel/openai.mjs tests/prompt-settings.test.mjs tests/vercel-api.test.mjs
git commit -m "feat: enforce direct structured tarot answers"
```

### Task 2: Store one continuous deck session with multiple rounds

**Files:**
- Modify: `database/schema.vercel.sql`
- Create: `database/migrations/002_continuous_tarot_deck.sql`
- Modify: `lib/vercel/routes/ai.mjs`
- Modify: `api/ai/[...route].mjs`
- Modify: `lib/vercel/readings.mjs`
- Test: `tests/ai-workflow.test.mjs`
- Test: `tests/vercel-api.test.mjs`

**Interfaces:**
- `createDeckSession(request)` returns `{ session, remaining, rounds: [] }`
- `drawReadingRound(request, sessionId)` accepts `{ count, question, request_id }` and returns an atomically allocated round
- `answerReadingRound(request, sessionId, roundId)` stores the structured answer and returns the current session plus round
- `getDeckSession(request, sessionId)` returns the session, all rounds, remaining count, and legacy messages
- `resetDeckSession(request, sessionId)` closes the active session without deleting history

- [ ] **Step 1: Write failing database and route tests**

Assert that the schema contains `reading_rounds`, that a session stores a 78-card `deck_order` and `draw_cursor`, and that the route source locks a session row before slicing the deck. Add a route test for two draws:

```js
assert.match(schema, /CREATE TABLE IF NOT EXISTS reading_rounds/);
assert.match(source, /FOR UPDATE/);
assert.match(source, /request_id/);
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/ai-workflow.test.mjs tests/vercel-api.test.mjs`

Expected: FAIL because the new table, session fields, and round endpoints are absent.

- [ ] **Step 3: Add an additive migration**

Add `deck_order JSONB`, `draw_cursor INTEGER NOT NULL DEFAULT 0`, and `opened_count INTEGER NOT NULL DEFAULT 0` to `reading_sessions` with idempotent `ADD COLUMN IF NOT EXISTS`. Create `reading_rounds` with UUID id, session foreign key, unique `(session_id, round_number)`, question, cards, answer JSON, answer text, status, `request_id`, and timestamps. Add nullable `round_id UUID` to `reading_messages` with a foreign key to `reading_rounds` after the new table exists, plus indexes for session, round, and request id. Leave old `cards` and existing message rows intact.

- [ ] **Step 4: Implement atomic session and round operations**

Generate a server-side shuffled 78-card order when creating a session. In `drawReadingRound`, run a transaction that selects the owner’s active session `FOR UPDATE`, rejects an exhausted/overdrawn deck, checks `request_id` for an existing round, slices exactly `count` cards, advances cursor, and inserts one round. In `answerReadingRound`, load only the current round’s cards and bounded previous round summaries, call `createTarotResponse`, then update the round and append messages. Never create or close a parent session for a follow-up round.

- [ ] **Step 5: Map and verify the endpoints**

Map the new commands in the existing flat Vercel route while preserving legacy detail/message/close commands. Run:

Run: `node --test tests/ai-workflow.test.mjs tests/vercel-api.test.mjs tests/reading-sessions.test.mjs`

Expected: all route, ownership, duplicate-card, and migration tests pass.

- [ ] **Step 6: Commit the continuous session backend**

```bash
git add database/schema.vercel.sql database/migrations/002_continuous_tarot_deck.sql lib/vercel/routes/ai.mjs api/ai/[...route].mjs lib/vercel/readings.mjs tests/ai-workflow.test.mjs tests/vercel-api.test.mjs
git commit -m "feat: persist continuous tarot deck rounds"
```

### Task 3: Rebuild the browser state around rounds

**Files:**
- Modify: `ai/ai.js`
- Modify: `ai/memory.mjs`
- Modify: `ai/reading-sets.mjs`
- Test: `tests/ai-workflow.test.mjs`
- Test: `tests/e2e/guest.spec.mjs`

**Interfaces:**
- `createLocalDeckSession()` returns `{ deckOrder, cursor, rounds, activeQuestion }`
- `drawNextRound(count, question)` returns the next unique card slice and appends one round
- `resetDeckSession()` starts a new 78-card order and clears only the active session
- `startFollowUp()` stores the question as the next round’s question without drawing until the user selects a count and presses `เปิดไพ่`

- [ ] **Step 1: Write failing browser/state tests**

Assert that a first 3-card draw followed by a 2-card draw creates two rounds, uses five unique cards, leaves 73 cards, and keeps the first answer in history. Assert that reset returns to 78 and that follow-up does not call AI before the second draw.

- [ ] **Step 2: Run the focused state/E2E tests and confirm failure**

Run: `npx playwright test tests/e2e/guest.spec.mjs -g "continuous deck|follow-up"`

Expected: FAIL because the current state still uses `previousReadingId` and the follow-up path creates a second server reading.

- [ ] **Step 3: Replace linked-reading state with round state**

Remove `previousReadingId` as the primary flow state. Keep one `sessionId`, store local `deckOrder/cursor/rounds`, and generate a stable `request_id` for each draw. Make `drawCards()` call the round draw operation, render the selected round, then call answer only in member mode. Manual mode renders the round immediately without an AI request.

- [ ] **Step 4: Make Memory round-aware**

Update `memory.mjs` to store one turn per round and to return previous context only when the user is asking a continuation. The current question must be passed separately and marked as primary. Save the full local session under a versioned key and migrate the existing `tarot-daily-ai-reading-v2` shape into round 1 without losing cards already opened.

- [ ] **Step 5: Verify browser state behavior**

Run: `npx playwright test tests/e2e/guest.spec.mjs -g "continuous deck|follow-up"`

Expected: desktop and mobile pass for unique successive rounds, reset, reload recovery, and no AI call before a new spread is opened.

- [ ] **Step 6: Commit the browser state**

```bash
git add ai/ai.js ai/memory.mjs ai/reading-sets.mjs tests/ai-workflow.test.mjs tests/e2e/guest.spec.mjs
git commit -m "feat: make tarot browser state round based"
```

### Task 4: Make the UI read like a clear tarot ritual

**Files:**
- Modify: `ai/index.html`
- Modify: `ai/ai.css`
- Modify: `ai/ai.js`
- Test: `tests/e2e/guest.spec.mjs`
- Test: `tests/e2e/member-ai.spec.mjs`
- Test: `tests/two-mode-foyer.test.js`

**Interfaces:**
- Visible labels are `คำฟันธงจากไพ่`, `ไพ่ที่เปิดได้`, `ความหมายของไพ่`, `คำทำนาย`, and `คำทำนายโดยรวม`
- The primary action remains exactly `เปิดไพ่`
- The continuation action is `ถามต่อจากเรื่องเดิม` and returns to the question/count rail

- [ ] **Step 1: Write failing visual/interaction assertions**

Assert that the answer contains `คำฟันธงจากไพ่`, that ordinary output has no `คำแนะนำถัดไป` or `คำถามชวนทบทวน`, that each round has its own heading, and that the choice buttons meet the desktop/mobile minimum sizes.

- [ ] **Step 2: Run the focused E2E tests and confirm failure**

Run: `npx playwright test tests/e2e/guest.spec.mjs tests/e2e/member-ai.spec.mjs -g "tarot|card|answer|mobile"`

Expected: FAIL on the old linked-reading labels, old answer parser sections, or current panel layout assertions.

- [ ] **Step 3: Implement the single vertical reading rail**

Place question, card count, draw action, reveal, verdict, card details, overall prediction, and continuation in one vertical order. Replace nested panel styling with spacing/dividers, keep the witch artwork as a supporting ambient layer, and keep the selected card image at its complete source aspect ratio. Render one round group per draw with the round number and count.

- [ ] **Step 4: Implement mobile layout and motion**

Use one-column controls under 650px, minimum 48px touch targets, full-width count buttons, readable 16px body text, and cards that never use `object-fit: cover`. Keep the ambient wheel always on and stagger the card reveal with the existing motion classes.

- [ ] **Step 5: Verify desktop and mobile UI**

Run: `npx playwright test tests/e2e/guest.spec.mjs tests/e2e/member-ai.spec.mjs`

Expected: all available desktop/mobile tests pass with no horizontal overflow and full card images.

- [ ] **Step 6: Commit the UI rail**

```bash
git add ai/index.html ai/ai.css ai/ai.js tests/e2e/guest.spec.mjs tests/e2e/member-ai.spec.mjs tests/two-mode-foyer.test.js
git commit -m "feat: present tarot rounds as a smooth reading rail"
```

### Task 5: Production verification, migration, and deployment

**Files:**
- Modify: `docs/runbooks/production-launch.md`
- Modify: `docs/runbooks/witch-two-modes-launch.md`
- Test: `tests/*.mjs`
- Test: `tests/e2e/*.mjs`

**Interfaces:**
- `npm test` is the unit/static gate
- `npm run test:e2e` is the desktop/mobile gate
- `https://tarot-daily-78-history.vercel.app/api/health` is the production dependency gate

- [ ] **Step 1: Run all local verification commands**

Run:

```bash
npm run check
npm test
npm run test:e2e
git diff --check
```

Expected: zero unit failures, zero E2E failures other than explicitly credential-gated skips, no syntax errors, and no whitespace errors.

- [ ] **Step 2: Run production migration safely**

Run the existing migration command against the configured Vercel/Neon database. Verify `schema_migrations` contains version 2 and that existing reading rows remain queryable. Do not delete or rewrite old sessions.

- [ ] **Step 3: Deploy and verify production assets**

Push `main`, wait for Vercel, fetch `/ai/` with a cache-busting query, and verify the HTML references the current asset version. Fetch `/api/health` and require `ready`, `database`, `schema`, `admin`, and `ai` to be true.

- [ ] **Step 4: Perform the live acceptance flow**

In a logged-in browser, run one real question, select 1 card, open it, verify the answer begins with the verdict, enter a follow-up, select 2 cards, open them, and verify the second round is new and the first question remains in history. In a logged-out browser, open 3 cards and then 1 more without an AI request. Repeat the two flows at mobile width.

- [ ] **Step 5: Scan the final diff for secrets and report limitations**

Run:

```bash
git grep -n -E "sk-proj-|sk-[A-Za-z0-9_-]{20,}" -- . ":!output/*"
```

Expected: no output. Report any credential-gated E2E skips separately; never print an API key.

- [ ] **Step 6: Commit and push the verified release**

```bash
git add docs/runbooks/production-launch.md docs/runbooks/witch-two-modes-launch.md
git commit -m "docs: document continuous tarot production release"
git push origin HEAD:main
```
