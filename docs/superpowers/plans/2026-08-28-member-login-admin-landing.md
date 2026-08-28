# Member Login, Admin Landing, and AI Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มหน้า Landing/Login ของ Admin, หน้า Login/สมัครสมาชิกของผู้ใช้ และหน้า AI Tarot แยก โดยคง Guest draw และการใช้งานบน Vercel ไว้ครบ.

**Architecture:** ใช้ Vercel static pages ที่ `/login/`, `/ai/` และ `/admin/` เรียก catch-all Vercel Functions แบบ same-origin. ผู้ใช้จะมี username/password ใน Postgres; Admin เป็น owner account ที่สร้างครั้งแรกผ่าน bootstrap และผู้สมัครใหม่จะอยู่สถานะ pending จนกว่า Admin จะอนุมัติหรือสร้าง Beta Access ให้. รหัสผ่านและ Beta code เก็บเป็น bcrypt hash เท่านั้น.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Vercel Node.js Functions, Neon Postgres, bcryptjs, Node crypto, OpenAI Responses API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-28-vercel-native-ai-auth-design.md`

## Global Constraints

- Guest เปิดไพ่ 1/2/3 ใบได้โดยไม่ล็อกอิน และไพ่ไม่ซ้ำจนกว่าจะล้างสำรับ.
- บัญชี owner ใช้ username `oHizokao`; รหัสผ่านรับผ่าน bootstrap form และไม่ commit plaintext ลง repository.
- ผู้สมัครใหม่สมัครได้ แต่ใช้ AI ไม่ได้จนกว่าจะได้รับสถานะ active/Beta จาก Admin.
- API key ห้ามอยู่ใน client bundle, GitHub หรือ JSON response.
- Vercel เป็น runtime เดียวของ flow นี้; ใช้ catch-all functions ให้ไม่เกิน Hobby limit.
- AI อ่านเฉพาะคำบนไพ่ที่เปิดจริง ตอบเป็นแนวทางที่ไม่ฟันธงและไม่กระทบชีวิตผู้ใช้.
- Desktop/mobile ต้องไม่มี horizontal overflow และรองรับ reduced motion.

---

### Task 1: Add failing contracts for member, admin, and AI pages

**Files:**
- Modify: `tests/vercel-native.test.mjs`
- Create: `tests/member-auth-contract.test.mjs`

**Interfaces:**
- `/login/` contains login and signup forms with username fields.
- `/ai/` contains the separate question textarea, answer region, and login CTA.
- `/admin/` contains a public landing copy, owner-login form, and dashboard copy for user access management.
- Frontend calls `/api/auth/login`, `/api/auth/register`, and `/api/auth/me` without `.php`.

- [x] **Step 1: Write the failing tests**

```js
assert.match(loginHtml, /id="member-login-form"/);
assert.match(loginHtml, /id="member-signup-form"/);
assert.match(aiHtml, /id="ai-question"/);
assert.match(adminHtml, /สร้าง/อนุมัติผู้ใช้งาน/);
assert.match(authRoute, /register/);
```

- [x] **Step 2: Run `npm test -- tests/member-auth-contract.test.mjs tests/vercel-native.test.mjs` and confirm RED**

Expected failure: `/login/`, `/ai/`, and member endpoints do not exist yet.

- [x] **Step 3: Keep the failure focused on missing page/endpoint contracts**

Do not change production files before the failing assertions are observed.

---

### Task 2: Extend Postgres users and auth routes

**Files:**
- Modify: `database/schema.vercel.sql`
- Modify: `lib/vercel/auth.mjs`
- Modify: `lib/vercel/routes/auth.mjs`
- Modify: `api/auth/[...route].mjs`
- Test: `tests/vercel-api.test.mjs`

**Interfaces:**
- `users.username` is unique and lower-case normalized for lookup.
- `POST /api/auth/register` accepts `{ username, name, email, password }` and returns a safe public user with `status: "pending"`.
- `POST /api/auth/login` accepts `{ username, password }`, allows `admin` or active `member`/`beta_user`, and returns a signed HttpOnly cookie plus CSRF token.
- `GET /api/auth/me` returns `{ backend_configured, authenticated, user, csrf_token }` for any signed active user.
- `POST /api/auth/logout` clears the cookie.

- [x] **Step 1: Add failing tests**

Cover username normalization, password length, duplicate username, pending account rejection, and public-user redaction of `password_hash`/`access_code_hash`.

- [x] **Step 2: Run focused auth tests and verify RED**

Expected failure: schema and route exports do not expose username login/register yet.

- [x] **Step 3: Implement the smallest schema and route changes**

Add `username VARCHAR(80) NOT NULL UNIQUE`, expand role/status checks to include `member` and `pending`, and use bcrypt for the new password flow. Keep the existing Beta code flow as a compatibility path.

- [x] **Step 4: Run focused auth tests and verify GREEN**

Run `npm test -- tests/vercel-api.test.mjs` and confirm the auth contract is green without requiring a live database for pure validation tests.

---

### Task 3: Add owner bootstrap and Admin access management

**Files:**
- Modify: `lib/vercel/routes/admin.mjs`
- Modify: `admin/index.html`
- Modify: `admin/admin.js`
- Modify: `admin/admin.css`
- Modify: `database/schema.vercel.sql`

**Interfaces:**
- Bootstrap accepts `username` and creates the first owner Admin; the UI defaults the username field to `oHizokao` without embedding the password.
- Admin login accepts username or email and shows a generic invalid-credential message.
- Admin can list pending members, approve them as active, suspend them, or create/renew Beta Access.
- Admin create-user accepts username, name, email, and duration and returns a one-time access code.

- [x] **Step 1: Add failing admin tests**

Assert the bootstrap payload contains `username`, admin login sends username, and the dashboard has pending/approve controls.

- [x] **Step 2: Run the focused tests and observe RED**

Expected failure: current Admin only accepts email and only manages Beta rows.

- [x] **Step 3: Implement owner bootstrap and member actions**

Use `requireAdmin` plus CSRF for mutations, return only `publicUser`, and never return password/API-key values.

- [x] **Step 4: Run all auth/admin tests and verify GREEN**

Run `npm test` and `npm run check`.

---

### Task 4: Build the public Login/Signup and dedicated AI pages

**Files:**
- Create: `login/index.html`
- Create: `login/login.js`
- Create: `login/login.css`
- Create: `ai/index.html`
- Create: `ai/ai.js`
- Create: `ai/ai.css`
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`

**Interfaces:**
- `/login/` has Login and สมัครสมาชิก tabs, username/password inputs, clear pending/approved status, and link back to draw cards.
- `/ai/` has a dedicated draw summary, selected card words, question textarea, answer region, logout action, and link back to `/`.
- Main page header contains `เข้าสู่ระบบ`; a logged-in member sees `ถามไพ่กับ AI`.
- Guests still use the existing draw controls; AI submit requires an authenticated active Beta-capable user.

- [x] **Step 1: Add failing static/UI tests**

Assert both pages load their CSS/JS, have mobile viewport tags, link to each other, and do not contain plaintext passwords/API keys.

- [x] **Step 2: Run UI contract tests and observe RED**

- [x] **Step 3: Implement page-specific UI and shared session handling**

Use the existing motion classes and card metadata; store the selected cards in the existing browser state and pass only their exact filenames to `/api/ai/tarot-chat`.

- [x] **Step 4: Run static checks and browser checks**

Verify Guest draw, Login/Signup form validation, admin landing layout, AI page locked state, and responsive widths.

---

### Task 5: Deploy and verify production behavior

**Files:**
- Modify: `README.md`
- Modify: `.vercelignore`
- Modify: `tests/vercel-native.test.mjs`

**Interfaces:**
- Vercel deploy remains at `https://tarot-daily-78-history.vercel.app/`.
- `/login/`, `/ai/`, and `/admin/` return HTML.
- `/api/health` returns JSON and the four-function Hobby architecture remains intact.

- [x] **Step 1: Run `npm test`, `npm run check`, and all `.mjs` syntax checks**
- [x] **Step 2: Run desktop and 390px responsive browser checks**
- [x] **Step 3: Push `main` and wait for a Ready Vercel deployment**
- [x] **Step 4: Verify production Guest draw, page links, and backend-configured messaging**
- [x] **Step 5: Report the exact Neon/environment setup required before live Login/AI**

The owner must still connect Neon, run `database/schema.vercel.sql`, set session/encryption/bootstrap secrets, and add the OpenAI key before the new account can log in against production.
