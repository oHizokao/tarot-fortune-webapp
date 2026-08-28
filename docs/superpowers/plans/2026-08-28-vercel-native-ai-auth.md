# Vercel-Native AI Auth Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: ย้ายระบบ backend จาก PHP ไปเป็น Vercel Node.js Functions + Neon Postgres เพื่อให้ Guest, Beta login, AI reader และ Admin ใช้งานได้จาก Vercel โดเมนเดียว

Architecture: Static frontend เรียก same-origin /api/* Vercel Functions. Hobby plan ใช้ catch-all functions สี่ไฟล์ (health, auth, AI, admin) เพื่อไม่เกิน function limit. Functions ใช้ Neon serverless Postgres สำหรับ users, AI usage และ encrypted settings; session เป็น signed HttpOnly cookie และ OpenAI key อยู่เฉพาะ server.

Tech Stack: Vanilla HTML/CSS/JavaScript, Vercel Node.js Functions, Neon Postgres, @neondatabase/serverless, bcryptjs, Node built-in crypto, OpenAI Responses API ผ่าน fetch, Node test runner, Playwright checks.

Spec: docs/superpowers/specs/2026-08-28-vercel-native-ai-auth-design.md

## Global Constraints

- Guest ต้องเปิดไพ่ได้โดยไม่ล็อกอิน.
- Beta user ต้องได้รับ code จาก Admin และถาม AI ได้เฉพาะไพ่ที่เปิดจริง.
- API key ห้ามอยู่ใน client bundle, GitHub หรือ response ใด ๆ.
- คำตอบ AI ต้องเป็นแนวทางที่ปลอดภัย ไม่ฟันธงชีวิตและไม่ทำให้ผู้ใช้จิตตก.
- Vercel เป็น runtime เดียวของ flow นี้; ห้ามพึ่ง PHP สำหรับ flow ใด ๆ.
- ต้องรองรับ desktop/mobile และ reduced-motion.

---

### Task 1: Add failing Vercel integration tests

Files:
- Create: tests/vercel-native.test.mjs
- Modify: package.json

Interfaces:
- Tests assert the public contracts from the design spec before implementation.

- [ ] Step 1: Write failing tests for guest chat preview, admin link, absence of .php endpoints, Vercel handler files, and static admin page.
- [ ] Step 2: Run npm test -- tests/vercel-native.test.mjs and confirm RED because the new Vercel files/UI do not exist.
- [ ] Step 3: Preserve the failing output as the baseline.

### Task 2: Add Vercel dependencies and Postgres schema

Files:
- Modify: package.json
- Create: database/schema.vercel.sql
- Create: lib/vercel/db.mjs
- Create: lib/vercel/http.mjs
- Create: lib/vercel/security.mjs

Interfaces:
- sql executes parameterized Neon queries from DATABASE_URL.
- json(data, init) returns JSON with no-store headers.
- Shared helpers parse JSON, read/write cookies, sign sessions, verify passwords/access codes, create CSRF tokens, and encrypt/decrypt secrets.

- [ ] Step 1: Add @neondatabase/serverless and bcryptjs and run npm install.
- [ ] Step 2: Add users, ai_usage, and app_settings Postgres tables.
- [ ] Step 3: Implement controlled JSON errors for missing env/database; never return stack traces or secrets.
- [ ] Step 4: Run the tests and Node syntax checks; the endpoint/UI assertions remain RED only for missing implementation.

### Task 3: Implement Vercel auth and health functions

Files:
- Create: api/health.mjs
- Create: api/auth/[...route].mjs
- Create: api/admin/[...route].mjs
- Create: lib/vercel/routes/auth.mjs
- Create: lib/vercel/routes/admin.mjs

Interfaces:
- Browser uses /api/auth/* and /api/admin/* without .php.
- Beta code maps to one active, non-expired beta_user.
- Bootstrap creates exactly one active admin when no admin exists and requires TAROT_BOOTSTRAP_SECRET.

- [ ] Step 1: Add handler-export contract tests and run them RED.
- [ ] Step 2: Implement health, Beta login/session, and admin login/session handlers behind catch-all routes.
- [ ] Step 3: Set/clear HttpOnly, Secure, SameSite cookies and return CSRF token after login.
- [ ] Step 4: Run focused tests and syntax checks GREEN.

### Task 4: Implement Admin user/settings/usage functions

Files:
- Modify: lib/vercel/routes/admin.mjs
- Modify: api/admin/[...route].mjs

Interfaces:
- Admin actions: list, create tester with duration, suspend, reactivate, revoke, extend, delete, regenerate code.
- Settings stores encrypted OpenAI API key and plain model; GET returns configured/model only.
- All mutations require admin role + CSRF token.

- [ ] Step 1: Add tests for authorization and API-key redaction, then run RED.
- [ ] Step 2: Implement handlers with parameterized queries and one-time TF-... codes.
- [ ] Step 3: Run focused and full tests GREEN; confirm the deployed API function count remains under Hobby's limit.

### Task 5: Implement AI Tarot Function

Files:
- Create: api/ai/tarot-chat.mjs
- Modify: data/cards.json

Interfaces:
- POST /api/ai/tarot-chat accepts question, cards, and optional last four conversation turns.
- It validates Beta session, question length, card filename whitelist, usage limits, and metadata lookup.
- It calls the OpenAI Responses API with server-side key/model, store false, safe instructions, and returns answer only.

- [ ] Step 1: Add validation tests for empty question, fake card, missing session, and missing key; run RED.
- [ ] Step 2: Implement safe prompt, metadata lookup, rate limit, and usage logging.
- [ ] Step 3: Add a mocked fetch contract test ensuring no API key is returned.
- [ ] Step 4: Run all tests GREEN.

### Task 6: Update frontend and static Admin flow

Files:
- Modify: index.html
- Modify: app.js
- Modify: style.css
- Create: admin/index.html
- Modify: admin/admin.js
- Modify: admin/admin.css
- Modify: .vercelignore
- Modify: README.md

Interfaces:
- Guest sees a locked #ai-question-preview and visible Beta login CTA.
- Logged-in Beta sees #ai-question, answer area, logout, and can ask only after drawing.
- Root footer/header links to /admin/.
- Admin page is static HTML and uses same-origin Vercel Functions; it includes first-admin bootstrap UI.

- [ ] Step 1: Add UI/API contract tests and run RED against the hidden-only AI UI and old PHP paths.
- [ ] Step 2: Implement visible guest preview, Beta CTA, CSRF storage, member toggle, actionable backend errors, and no stale answer state.
- [ ] Step 3: Copy the Admin form into admin/index.html, add bootstrap form, update API calls, and ignore legacy PHP pages from Vercel.
- [ ] Step 4: Run npm test, Node checks, and desktop/mobile Playwright checks.

### Task 7: Build, deploy, and verify Vercel-only runtime

Files:
- Modify: vercel.json
- Modify: README.md

Interfaces:
- Vercel deploy includes Node Functions and ignores legacy PHP source files.
- README describes Neon integration, schema, environment variables, bootstrap, Beta tester, and OpenAI settings.

- [ ] Step 1: Configure Node function duration for AI and use the existing main deployment.
- [ ] Step 2: Run full local verification: npm test, syntax checks, card metadata checks, and Playwright guest/mobile/admin route tests.
- [ ] Step 3: Run the available Vercel build command and inspect that the four api/*.mjs routes are detected as Functions.
- [ ] Step 4: Push main, inspect the latest Vercel deployment, and verify root plus /admin/ return HTML while /api/health returns JSON.
- [ ] Step 5: Report exact environment/database setup still required if Vercel does not already have it; do not claim live AI/auth until the function can read the database and configured key.
