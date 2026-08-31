# Tarot Daily Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนระบบ Tarot Daily จากเว็บที่ส่วนประกอบหลักเปิดได้ ให้เป็นบริการ Production ที่ตรวจความพร้อมได้ สมัคร–อนุมัติ–ล็อกอิน–ถาม AI ต่อเนื่อง–ควบคุมโควตา–กู้ปัญหา และปล่อยเวอร์ชันใหม่ได้อย่างมั่นใจ.

**Architecture:** รักษาโครงสร้าง Vercel Static Pages + Vercel Node.js Functions + Neon Postgres เดิม เพื่อลดความเสี่ยงจากการย้ายระบบ แต่ย้าย state สำคัญ เช่น Memory, rate limit, session version และ audit trail ไปไว้ฝั่ง server. รวม endpoint ของ AI ไว้ใต้ catch-all Function เดียว และเพิ่ม diagnostics ที่เปิดรายละเอียดเฉพาะ Admin โดยไม่เปิดเผย secret.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Node.js 20+, Vercel Functions, Neon Postgres, `@neondatabase/serverless`, `bcryptjs`, OpenAI Responses API, GPT-5.6 Luna, Node test runner, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-vercel-native-ai-auth-design.md`

## Global Constraints

- Guest ต้องเปิดไพ่ 1/2/3 ใบได้โดยไม่ล็อกอิน และไพ่ไม่ซ้ำจนกว่าจะล้างสำรับ.
- ลูกค้าต้องสมัครและล็อกอินด้วยบัญชีของตนเอง; สมาชิก `pending`, `suspended` หรือ `expired` ต้องเรียก AI ไม่ได้.
- Memory ของคำถาม AI ต้องผูกกับ `user_id` และชุดไพ่เดียวกัน ห้ามข้ามบัญชีหรือข้ามชุดไพ่.
- API key, session secret, encryption key และ bootstrap secret ห้ามอยู่ใน client bundle, log, GitHub หรือ JSON response.
- `CRON_SECRET` ต้องเป็น secret แบบสุ่มยาวอย่างน้อย 32 ตัวอักษรและใช้เฉพาะ retention route.
- ใช้ `gpt-5.6-luna` เป็นค่าเริ่มต้นผ่าน Responses API; ตั้ง `reasoning.effort: "low"` เป็น baseline แล้ววัดคุณภาพ/เวลา/โทเคนก่อนเปลี่ยน.
- คำตอบต้องอ่านจากคำบนไพ่ที่เปิดจริง ไม่ฟันธงชีวิต ไม่สร้างความกลัว และไม่แทนคำแนะนำจากผู้เชี่ยวชาญ.
- Production ต้องไม่มี PHP เป็น runtime; ไฟล์ PHP เดิมต้องไม่ถูก deploy.
- ทุก mutation ใช้ signed HttpOnly cookie, CSRF token, same-origin validation และ parameterized SQL.
- ทุก task ใช้ TDD: เห็น test fail ก่อนแก้ implementation และ commit เมื่อ focused tests ผ่าน.

## Delivery Order

1. **P0 — เปิดบริการได้อย่างปลอดภัย:** Tasks 1–3 และ 5 ทำให้รู้ว่า config/database/OpenAI พร้อมจริง, migration ใช้ซ้ำได้, auth/rate limit เชื่อถือได้ และ AI มี timeout/quota.
2. **P1 — ลูกค้าใช้ต่อเนื่องได้:** Tasks 4, 6 และ 7 ย้าย Memory ไป server, ทำเครื่องมือ Admin และแก้ UX ทุกสถานะ.
3. **P2 — ดูแลระบบระยะยาว:** Tasks 8–9 เพิ่ม security headers, privacy, CI, smoke test, backup และ rollback runbook.

---

### Task 1: Production Readiness Diagnostics

**Files:**
- Create: `lib/vercel/readiness.mjs`
- Modify: `api/health.mjs`
- Modify: `lib/vercel/routes/admin.mjs`
- Modify: `api/admin/[...route].mjs`
- Modify: `admin/index.html`
- Modify: `admin/admin.js`
- Test: `tests/production-readiness.test.mjs`

**Interfaces:**
- Consumes: `query()` from `lib/vercel/db.mjs` and `getOpenAiSettings()` from `lib/vercel/settings.mjs`.
- Produces: `redactReadiness(checks)` returning only safe booleans and `adminReadiness(dependencies)` returning named checks without secret values.
- Adds: `GET /api/admin/diagnostics` for Admin only.

- [ ] **Step 1: Write failing tests for redaction and readiness states**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { redactReadiness } from "../lib/vercel/readiness.mjs";

test("public readiness never exposes secret values", () => {
  const result = redactReadiness({
    database: { ok: true, url: "postgres://secret" },
    schema: { ok: true, version: 1 },
    admin: { ok: true },
    openai: { ok: false, apiKey: "sk-secret", model: "gpt-5.6-luna" },
  });
  assert.deepEqual(result, { ready: false, database: true, schema: true, admin: true, ai: false });
  assert.doesNotMatch(JSON.stringify(result), /postgres|sk-secret/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/production-readiness.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/vercel/readiness.mjs`.

- [ ] **Step 3: Implement safe readiness helpers**

```js
export function redactReadiness(checks) {
  return {
    ready: Boolean(checks.database?.ok && checks.schema?.ok && checks.admin?.ok && checks.openai?.ok),
    database: Boolean(checks.database?.ok),
    schema: Boolean(checks.schema?.ok),
    admin: Boolean(checks.admin?.ok),
    ai: Boolean(checks.openai?.ok),
  };
}

export async function adminReadiness({ query, getOpenAiSettings }) {
  const database = await query("SELECT 1 AS ok", []).then(() => ({ ok: true })).catch(() => ({ ok: false }));
  const schema = database.ok
    ? await query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1", []).then((rows) => ({ ok: Number(rows[0]?.version || 0) >= 1, version: Number(rows[0]?.version || 0) })).catch(() => ({ ok: false, version: 0 }))
    : { ok: false, version: 0 };
  const admin = database.ok
    ? await query("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND status = 'active') AS ok", []).then((rows) => ({ ok: Boolean(rows[0]?.ok) })).catch(() => ({ ok: false }))
    : { ok: false };
  const settings = database.ok ? await getOpenAiSettings().catch(() => ({ configured: false, model: "" })) : { configured: false, model: "" };
  return { database, schema, admin, openai: { ok: Boolean(settings.configured && settings.model), model: settings.model || "" } };
}
```

- [ ] **Step 4: Wire public and Admin endpoints**

Public `/api/health` returns `{ ok, runtime, ready, database, ai }`. Admin `/api/admin/diagnostics` returns `{ database, schema, admin, openai }`; neither response includes environment values, connection strings, hashes, encrypted settings or API keys.

- [ ] **Step 5: Add the diagnostics card to `/admin/` and verify GREEN**

Show four rows: Database, Schema, Owner Admin, OpenAI. Each row displays `พร้อม`, `ยังไม่พร้อม`, or the model ID. Run `node --test tests/production-readiness.test.mjs` and `npm run check`.

- [ ] **Step 6: Commit**

```powershell
git add lib/vercel/readiness.mjs api/health.mjs lib/vercel/routes/admin.mjs api/admin/[...route].mjs admin/index.html admin/admin.js tests/production-readiness.test.mjs
git commit -m "feat: add production readiness diagnostics"
```

---

### Task 2: Versioned, Repeatable Database Migrations

**Files:**
- Create: `database/migrations/001_production_foundation.sql`
- Create: `scripts/migrate.mjs`
- Modify: `database/schema.vercel.sql`
- Modify: `package.json`
- Test: `tests/database-migrations.test.mjs`

**Interfaces:**
- Consumes: `DATABASE_URL` and Neon `query()`.
- Produces: `npm run migrate` that applies each numbered migration once inside a transaction.
- Produces schema used by Tasks 3–6: `schema_migrations`, `rate_limit_buckets`, `reading_sessions`, `reading_messages`, `admin_audit_log`, and new user control columns.

- [ ] **Step 1: Write the failing migration contract test**

```js
test("production migration is additive and idempotent", async () => {
  const sql = await fs.readFile("database/migrations/001_production_foundation.sql", "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS reading_sessions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rate_limit_buckets/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS daily_ai_limit/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/database-migrations.test.mjs`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the additive migration**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_ai_limit INTEGER NOT NULL DEFAULT 20 CHECK (daily_ai_limit BETWEEN 0 AND 500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  scope VARCHAR(40) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject_hash, window_start)
);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cards JSONB NOT NULL,
  title VARCHAR(160) NOT NULL DEFAULT 'คำถามใหม่',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reading_sessions_user_updated_idx ON reading_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS reading_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  model VARCHAR(120),
  response_id VARCHAR(160),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reading_messages_session_id_idx ON reading_messages (session_id, id);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(80) NOT NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name) VALUES (1, 'production_foundation') ON CONFLICT (version) DO NOTHING;
```

- [ ] **Step 4: Implement the migration runner**

`scripts/migrate.mjs` first creates `schema_migrations` if absent, then reads files matching `/^\d+_.+\.sql$/`, checks applied versions, executes each missing file inside a transaction, and exits non-zero on the first error. Keep `database/schema.vercel.sql` as the full fresh-install baseline containing the same final schema. Add `"migrate": "node scripts/migrate.mjs"` to `package.json`.

- [ ] **Step 5: Test against a disposable Neon branch**

Set `TEST_DATABASE_URL` to a disposable branch, run the migration twice, and assert both runs exit `0` and version `1` appears once. Never run an untested migration first against Production.

- [ ] **Step 6: Commit**

```powershell
git add database/migrations/001_production_foundation.sql database/schema.vercel.sql scripts/migrate.mjs package.json tests/database-migrations.test.mjs
git commit -m "feat: add versioned production migrations"
```

---

### Task 3: Server-Safe Authentication, Session Revocation, and Rate Limits

**Files:**
- Modify: `lib/vercel/rate-limit.mjs`
- Modify: `lib/vercel/security.mjs`
- Modify: `lib/vercel/auth.mjs`
- Modify: `lib/vercel/routes/auth.mjs`
- Modify: `lib/vercel/routes/admin.mjs`
- Test: `tests/auth-production.test.mjs`

**Interfaces:**
- Produces: `consumeRateLimit(scope, subject, limit, windowSeconds)` backed by Postgres.
- Produces: `sessionMatchesUser(session, user)` for version/identity checks.
- Session payload becomes `{ userId, role, csrf, sessionVersion }`; requests fail when token version differs from `users.session_version`.
- Adds: `POST /api/auth/change-password` accepting `{ current_password, new_password }`.

- [ ] **Step 1: Add failing tests for distributed limits and revoked sessions**

```js
test("session is rejected after session_version changes", async () => {
  const token = signSession({ userId: 7, role: "member", csrf: "csrf", sessionVersion: 2 });
  assert.equal(verifySession(token).sessionVersion, 2);
  assert.equal(sessionMatchesUser(verifySession(token), { id: 7, session_version: 3 }), false);
});
```

Add a SQL contract assertion that `consumeRateLimit` uses `INSERT ... ON CONFLICT ... DO UPDATE` and not a process-local `Map`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/auth-production.test.mjs`

Expected: FAIL because `sessionVersion` and `sessionMatchesUser` do not exist and rate limiting is process-local.

- [ ] **Step 3: Implement the Postgres bucket limiter**

```js
export async function consumeRateLimit(scope, subject, limit, windowSeconds) {
  const subjectHash = hashText(subject);
  const rows = await query(
    `INSERT INTO rate_limit_buckets (scope, subject_hash, window_start, hits)
     VALUES ($1, $2, TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM NOW()) / $3) * $3), 1)
     ON CONFLICT (scope, subject_hash, window_start)
     DO UPDATE SET hits = rate_limit_buckets.hits + 1
     RETURNING hits`,
    [scope, subjectHash, windowSeconds],
  );
  if (Number(rows[0]?.hits || 0) > limit) throw new AppError("ลองใหม่ภายหลัง", 429, "RATE_LIMITED");
}
```

- [ ] **Step 4: Add session version verification**

Include `sessionVersion` when signing. In `currentSession()`, fetch the user and reject/clear the cookie unless `payload.sessionVersion === user.session_version`. Increment `session_version` on password change, account suspension, password reset, and “ออกจากระบบทุกอุปกรณ์”.

- [ ] **Step 5: Add password-change flow and await every limiter call**

Validate current password, require new password length `8–200`, hash with bcrypt, set `must_change_password = FALSE`, increment `session_version`, then issue a new session. Login/admin login use limits `10/minute` by normalized identity + forwarded IP hash; AI uses Task 5 quotas.

- [ ] **Step 6: Run focused/full tests and commit**

Run: `node --test tests/auth-production.test.mjs tests/member-auth-contract.test.mjs && npm test && npm run check`

```powershell
git add lib/vercel/rate-limit.mjs lib/vercel/security.mjs lib/vercel/auth.mjs lib/vercel/routes/auth.mjs lib/vercel/routes/admin.mjs tests/auth-production.test.mjs
git commit -m "feat: harden authentication and rate limits"
```

---

### Task 4: Server-Side Reading Sessions and Memory

**Files:**
- Create: `lib/vercel/readings.mjs`
- Create: `lib/vercel/routes/ai.mjs`
- Create: `api/ai/[...route].mjs`
- Modify: `api/ai/tarot-chat.mjs` (move reusable functions, then remove this deploy route)
- Modify: `ai/ai.js`
- Modify: `ai/index.html`
- Modify: `ai/ai.css`
- Test: `tests/reading-sessions.test.mjs`
- Test: `tests/ai-memory-ui.test.js`

**Interfaces:**
- `POST /api/ai/readings` accepts `{ cards }` and returns `{ reading }`.
- `GET /api/ai/readings` returns the latest 20 sessions for the current account.
- `GET /api/ai/readings/:id` returns one owned session and its messages.
- `POST /api/ai/readings/:id/messages` accepts `{ question }`, calls Task 5 AI service, stores user/assistant messages, and returns `{ reading, answer, usage }`.
- `POST /api/ai/readings/:id/close` marks the session closed. A new topic always creates a new reading with a new card spread.
- Produces: `assertReadingOwner(reading, userId)` and `readingContext(reading)` in `lib/vercel/readings.mjs`.

- [ ] **Step 1: Write ownership and spread immutability tests**

```js
test("a reading never crosses user accounts", async () => {
  const reading = { id: "11111111-1111-4111-8111-111111111111", user_id: 10, cards: ["card-001.webp"] };
  assert.throws(() => assertReadingOwner(reading, 11), /READING_NOT_FOUND/);
});

test("follow-up context keeps the original cards", () => {
  assert.deepEqual(readingContext({ cards: ["card-001.webp"], messages: [] }).cards, ["card-001.webp"]);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/reading-sessions.test.mjs tests/ai-memory-ui.test.js`

- [ ] **Step 3: Implement reading persistence**

Use `randomUUID()` for session IDs. Validate 1–3 unique whitelist card filenames before insert. Every session query includes `WHERE id = $1 AND user_id = $2`. Store only the latest 12 message pairs as AI context while preserving the first question/answer pair.

- [ ] **Step 4: Consolidate AI routes**

`api/ai/[...route].mjs` dispatches `readings`, `readings/:id`, `readings/:id/messages`, and `readings/:id/close` to `lib/vercel/routes/ai.mjs`. Remove the standalone deploy route after importing its validation/input helpers, keeping the total Vercel Function count unchanged.

- [ ] **Step 5: Replace browser-only Memory for authenticated users**

The UI loads the current reading from the server after `/api/auth/me`. `localStorage` keeps only the Guest deck/history. The “ถามต่อจากคำถามเดิม” path posts to the current reading; “ล้างไพ่ · ถามเรื่องใหม่” closes it, clears textarea/answer, resets 78 cards, and creates a new reading only after the next draw.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/reading-sessions.test.mjs tests/ai-memory.test.mjs tests/ai-memory-ui.test.js && npm test && npm run check`

```powershell
git add lib/vercel/readings.mjs lib/vercel/routes/ai.mjs api/ai/[...route].mjs ai/ai.js ai/index.html ai/ai.css tests/reading-sessions.test.mjs tests/ai-memory-ui.test.js
git rm api/ai/tarot-chat.mjs
git commit -m "feat: persist tarot reading memory on server"
```

---

### Task 5: Reliable OpenAI Calls, Connection Test, Quotas, and Failure Logging

**Files:**
- Create: `lib/vercel/openai.mjs`
- Modify: `lib/vercel/routes/ai.mjs`
- Modify: `lib/vercel/routes/admin.mjs`
- Modify: `lib/vercel/settings.mjs`
- Modify: `admin/index.html`
- Modify: `admin/admin.js`
- Test: `tests/openai-production.test.mjs`

**Interfaces:**
- Produces: `createTarotResponse({ userId, question, cards, messages, settings })`.
- Produces: `testOpenAiConnection(settings)` used only by `POST /api/admin/ai-check`.
- Produces: `buildOpenAiBody({ model, instructions, input, userId })` for a deterministic request contract.
- Enforces `users.daily_ai_limit` using successful requests in the current Bangkok calendar day.
- Returns stable codes: `OPENAI_NOT_CONFIGURED`, `MODEL_UNAVAILABLE`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_UPSTREAM_ERROR`, `DAILY_LIMIT_REACHED`.

- [ ] **Step 1: Write failing request-contract tests**

```js
test("Luna production request is bounded and private", async () => {
  const body = buildOpenAiBody({ model: "gpt-5.6-luna", instructions: "safe", input: "question", userId: 7 });
  assert.equal(body.model, "gpt-5.6-luna");
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 900);
  assert.match(body.safety_identifier, /^[a-f0-9]{64}$/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/openai-production.test.mjs`

- [ ] **Step 3: Extract the OpenAI client and set hard bounds**

```js
export function buildOpenAiBody({ model, instructions, input, userId }) {
  return {
    model,
    reasoning: { effort: "low" },
    instructions,
    input,
    max_output_tokens: 900,
    store: false,
    safety_identifier: hashText(`tarot-user:${userId}`),
  };
}
```

Call `fetch("https://api.openai.com/v1/responses", { signal: AbortSignal.timeout(25_000), ... })`. Retry once after `500ms` only for `429`, `500`, `502`, `503`, or `504`; never retry auth/configuration errors.

- [ ] **Step 4: Enforce daily quota before calling OpenAI**

Count successful `ai_usage` rows where `created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')`. If count is at or above `daily_ai_limit`, return `429 DAILY_LIMIT_REACHED` without calling OpenAI. Insert a failure row with `request_status = 'failed'` and sanitized `error_type` for every upstream failure.

- [ ] **Step 5: Add the Admin connection-test button**

`POST /api/admin/ai-check` requires Admin + CSRF and performs a short response request with `max_output_tokens: 20`. UI shows model, success/failure code and latency; it never shows the key or upstream raw response body.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/openai-production.test.mjs tests/prompt-settings.test.mjs tests/vercel-api.test.mjs && npm test && npm run check`

```powershell
git add lib/vercel/openai.mjs lib/vercel/routes/ai.mjs lib/vercel/routes/admin.mjs lib/vercel/settings.mjs admin/index.html admin/admin.js tests/openai-production.test.mjs
git commit -m "feat: make OpenAI tarot requests production safe"
```

---

### Task 6: Admin Operations, Quotas, Password Recovery, and Audit Trail

**Files:**
- Create: `lib/vercel/audit.mjs`
- Modify: `lib/vercel/routes/admin.mjs`
- Modify: `admin/index.html`
- Modify: `admin/admin.js`
- Modify: `admin/admin.css`
- Modify: `login/index.html`
- Modify: `login/login.js`
- Test: `tests/admin-production.test.mjs`

**Interfaces:**
- Adds Admin actions: `set_daily_limit`, `reset_password`, `revoke_sessions`, and existing approve/suspend/reactivate actions.
- `reset_password` returns a random temporary password once, stores only its bcrypt hash, sets `must_change_password = TRUE`, and increments `session_version`.
- Produces: `safeAuditDetails(details)` from `lib/vercel/audit.mjs`.
- Every Admin mutation writes `{ admin_user_id, action, target_user_id, details }` to `admin_audit_log`; details contain IDs/settings names but no passwords, codes, keys, hashes or prompt contents.

- [ ] **Step 1: Write failing redaction and audit tests**

```js
test("audit details remove secrets", () => {
  assert.deepEqual(safeAuditDetails({ target: 8, password: "secret", apiKey: "sk-secret" }), { target: 8 });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/admin-production.test.mjs`

- [ ] **Step 3: Implement audited Admin actions**

Wrap each mutation so the database update and audit insert occur in the same transaction. Quotas accept integers `0–500`. Session revocation increments `session_version`. Temporary passwords use `randomBytes(12).toString("base64url")` and display once.

- [ ] **Step 4: Enforce password change after recovery**

`/api/auth/me` returns `must_change_password`. `/ai/` remains locked while true. `/login/` displays the change-password form and posts to `/api/auth/change-password`; successful change creates a fresh session.

- [ ] **Step 5: Add Admin UX**

For each member show status, AI expiry, daily quota, usage today, “ระงับ”, “ออกจากระบบทุกอุปกรณ์” and “ออกรหัสผ่านชั่วคราว”. Add an audit table with latest 50 actions and no secret fields.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/admin-production.test.mjs tests/member-auth-contract.test.mjs && npm test && npm run check`

```powershell
git add lib/vercel/audit.mjs lib/vercel/routes/admin.mjs admin/index.html admin/admin.js admin/admin.css login/index.html login/login.js tests/admin-production.test.mjs
git commit -m "feat: add production admin controls and audit log"
```

---

### Task 7: Customer UX for Every Real System State

**Files:**
- Create: `lib/client/error-copy.js`
- Modify: `login/login.js`
- Modify: `ai/ai.js`
- Modify: `ai/index.html`
- Modify: `ai/ai.css`
- Modify: `index.html`
- Test: `tests/customer-production-ui.test.js`

**Interfaces:**
- Produces: `messageForError(code)` with Thai customer-safe messages.
- UI states: guest, pending, active/no-AI, active/AI-ready, must-change-password, quota-reached, session-expired, AI-timeout, offline.
- Retry button retries only the last unanswered question in the same reading; it never draws new cards or duplicates a stored user message.

- [ ] **Step 1: Write failing UI-state tests**

```js
test("customer errors are actionable", () => {
  assert.equal(messageForError("DAILY_LIMIT_REACHED"), "วันนี้ใช้สิทธิ์ถาม AI ครบแล้ว กรุณาลองใหม่พรุ่งนี้หรือติดต่อผู้ดูแล");
  assert.equal(messageForError("AI_TIMEOUT"), "AI ใช้เวลานานกว่าปกติ คำถามยังไม่ถูกนับสิทธิ์ กดลองอีกครั้งได้");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/customer-production-ui.test.js`

- [ ] **Step 3: Implement the error-copy map and state renderer**

Map only known server codes. Unknown errors show “ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง” plus `request_id`; never display stack traces or upstream response bodies.

- [ ] **Step 4: Add loading, retry, and duplicate-submit protection**

Disable draw/reset/ask controls during an active request, keep one `AbortController`, and use a client request ID. A second click while busy does nothing. On success, clear only the textarea and keep the reading session visible.

- [ ] **Step 5: Verify desktop/mobile/accessibility**

At widths `1440×900`, `768×1024`, and `390×844`, verify no horizontal overflow, question/history controls remain reachable, focus returns to the answer heading, and `prefers-reduced-motion: reduce` disables card/answer animations.

- [ ] **Step 6: Commit**

```powershell
git add lib/client/error-copy.js login/login.js ai/ai.js ai/index.html ai/ai.css index.html tests/customer-production-ui.test.js
git commit -m "feat: complete customer production states"
```

---

### Task 8: Security Headers, Request IDs, Privacy, and Operational Logs

**Files:**
- Create: `lib/vercel/logging.mjs`
- Create: `lib/vercel/retention.mjs`
- Create: `privacy/index.html`
- Create: `terms/index.html`
- Modify: `lib/vercel/http.mjs`
- Modify: `lib/vercel/routes/admin.mjs`
- Modify: `api/admin/[...route].mjs`
- Modify: `vercel.json`
- Modify: `index.html`
- Modify: `login/index.html`
- Test: `tests/security-production.test.mjs`

**Interfaces:**
- Every API response includes `x-request-id`; JSON failures also include `request_id`.
- Logs are structured JSON with request ID, route, status, duration, user ID hash and error code only.
- Vercel sets CSP, clickjacking, MIME-sniffing, referrer and permission headers.

- [ ] **Step 1: Write failing security contract tests**

```js
test("security headers block framing and external scripts", async () => {
  const config = JSON.parse(await fs.readFile("vercel.json", "utf8"));
  const text = JSON.stringify(config.headers);
  assert.match(text, /frame-ancestors 'none'/);
  assert.match(text, /X-Content-Type-Options/);
  assert.match(text, /Permissions-Policy/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/security-production.test.mjs`

- [ ] **Step 3: Add request IDs and sanitized structured logs**

Use `crypto.randomUUID()` when `x-request-id` is absent. Log one line at request completion. Never log request bodies for login, registration, Admin settings, password change or AI questions.

- [ ] **Step 4: Add Vercel headers**

Set `Content-Security-Policy` to `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

- [ ] **Step 5: Implement retention and add Privacy/Terms pages**

`purgeExpiredData()` deletes closed `reading_sessions` whose `updated_at` is older than 90 days, `ai_usage` older than 180 days, `admin_audit_log` older than 180 days, and stale `rate_limit_buckets` older than 2 days. Route `/api/admin/retention` accepts only `Authorization: Bearer ${CRON_SECRET}` and returns counts, never deleted content. Configure a weekly Vercel Cron for `0 3 * * 0`.

Privacy and Terms state what account, reading, usage and audit data is stored; that readings are for reflection/entertainment; how users request account/reading deletion; and the implemented 90/180-day retention periods. Link both pages from root, login, AI and Admin footers.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/security-production.test.mjs && npm test && npm run check`

```powershell
git add lib/vercel/logging.mjs lib/vercel/retention.mjs privacy/index.html terms/index.html lib/vercel/http.mjs lib/vercel/routes/admin.mjs api/admin/[...route].mjs vercel.json index.html login/index.html tests/security-production.test.mjs
git commit -m "feat: add production security and privacy controls"
```

---

### Task 9: CI, End-to-End Smoke Tests, Launch, and Rollback

**Files:**
- Create: `playwright.config.mjs`
- Create: `tests/e2e/guest.spec.mjs`
- Create: `tests/e2e/member-ai.spec.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/production-smoke.yml`
- Create: `docs/runbooks/production-launch.md`
- Modify: `package.json`

**Interfaces:**
- `npm run test:e2e` runs Guest tests locally.
- `BASE_URL`, `E2E_TEST_USERNAME`, and `E2E_TEST_PASSWORD` run the full member/AI smoke against a selected Vercel deployment.
- Launch runbook defines exact go/no-go checks and rollback procedure.

- [ ] **Step 1: Add Playwright and failing E2E tests**

```js
test("guest draws without login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await expect(page.locator(".result-card")).toHaveCount(1);
});

test("approved member asks a follow-up in the same reading", async ({ page }) => {
  await page.goto("/login/");
  await page.getByLabel("Username").fill(process.env.E2E_TEST_USERNAME);
  await page.getByLabel("รหัสผ่าน").fill(process.env.E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.goto("/ai/");
  await page.getByRole("button", { name: /เปิดไพ่/ }).click();
  await page.getByLabel("คำถามของคุณ").fill("วันนี้ควรเริ่มดูแลตัวเองจากตรงไหน?");
  await page.getByRole("button", { name: /ถาม AI/ }).click();
  await expect(page.locator("#ai-answer")).not.toBeEmpty();
  await page.getByLabel("คำถามของคุณ").fill("แล้วก้าวเล็กที่สุดคืออะไร?");
  await page.getByRole("button", { name: /ถาม AI/ }).click();
  await expect(page.locator("#memory-title")).toContainText("ถามต่อ");
});
```

- [ ] **Step 2: Run E2E tests and verify RED before configuration**

Run: `npx playwright test tests/e2e/guest.spec.mjs`

Expected: FAIL until Playwright config and local web server are wired.

- [ ] **Step 3: Add CI workflows**

`ci.yml` runs `npm ci`, `npm test`, `npm run check`, and Guest Playwright at `390×844` plus desktop on every pull request. `production-smoke.yml` is `workflow_dispatch`, accepts `base_url`, and reads test credentials from GitHub Actions secrets; it never prints those values.

- [ ] **Step 4: Write the launch runbook**

The runbook executes in this order:

1. Create a Neon backup branch from Production.
2. Run migrations against a disposable branch, then Production.
3. Confirm Vercel Production has `DATABASE_URL`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `TAROT_BOOTSTRAP_SECRET`, and `CRON_SECRET`; configure OpenAI key through `/admin/`.
4. Open `/admin/diagnostics`; require Database, Schema, Owner and OpenAI all green.
5. Create a dedicated `e2e_tarot` member, approve it, set daily limit `10`, and store its credentials only in GitHub Actions secrets.
6. Run Production smoke for Guest, signup, pending rejection, approved login, one AI question, one follow-up, new reading, logout, session revocation and mobile layout.
7. Observe Vercel logs and `ai_usage` for 30 minutes; require no unexplained `5xx` and no secret values.
8. Mark the deployment ready.

- [ ] **Step 5: Define rollback**

If smoke fails after deploy, promote the previous Vercel deployment. Database changes in migration `001` are additive, so do not drop tables/columns during rollback. Disable AI from Admin settings if the issue is upstream-only, preserve `request_id`, and investigate before re-enabling.

- [ ] **Step 6: Run the complete release gate and commit**

Run: `npm test && npm run check && npm run test:e2e`

```powershell
git add playwright.config.mjs tests/e2e .github/workflows/ci.yml .github/workflows/production-smoke.yml docs/runbooks/production-launch.md package.json package-lock.json
git commit -m "test: add production release gates"
```

---

## Launch Acceptance Criteria

- Public diagnostics says `ready: true`; Admin diagnostics shows Database, Schema, Owner Admin and OpenAI ready.
- Guest opens 1/2/3 cards, gets no duplicates within 78 cards, uses history/Copy PNG, and resets cleanly on desktop/mobile.
- New member registers as `pending`; Admin approves; suspended/expired/pending users cannot call AI.
- Approved member logs in, opens cards, asks AI, asks a follow-up using the same server-side reading, starts a new topic with a new spread, and restores history after refresh/another device.
- AI request times out within 25 seconds, retries only transient failures once, obeys daily quota, stores no OpenAI response remotely (`store: false`), and never returns an API key.
- Admin can test OpenAI, view diagnostics, adjust quota, revoke sessions, issue one-time temporary passwords, and inspect an audit trail without secret values.
- Production smoke passes at desktop and `390×844`; CI is green; a Neon backup branch and previous Vercel deployment are available for rollback.

## Explicit Non-Goals for This Launch

- ไม่มีระบบชำระเงินหรือ subscription ในรอบนี้.
- ไม่มีการส่งอีเมลอัตโนมัติ; การกู้รหัสผ่านใช้ Admin-issued temporary password.
- ไม่มี native mobile app; รองรับ responsive web เท่านั้น.
- ไม่มีการตีความสุขภาพ กฎหมาย การลงทุน หรือเหตุฉุกเฉินแทนผู้เชี่ยวชาญ.
