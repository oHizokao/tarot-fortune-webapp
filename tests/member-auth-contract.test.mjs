import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");

test("member pages expose login, signup, and the separate AI reader", async () => {
  const login = await read("login/index.html");
  const ai = await read("ai/index.html");
  const aiScript = await read("ai/ai.js");

  assert.match(login, /id="login-form"/);
  assert.match(login, /id="login-username"/);
  assert.match(login, /id="signup-form"/);
  assert.match(login, /สมัครสมาชิก/);
  assert.match(ai, /id="ai-reader-app"/);
  assert.match(ai, /id="ai-question"/);
  assert.match(ai, /id="ask-ai-button"/);
  assert.match(aiScript, /\/api\/auth\/me/);
  assert.match(aiScript, /\/api\/ai\/tarot-chat/);
});

test("admin is a landing page with member approval controls", async () => {
  const html = await read("admin/index.html");
  const script = await read("admin/admin.js");

  assert.match(html, /id="admin-landing"/);
  assert.match(html, /id="admin-username"/);
  assert.match(html, /value="oHizokao"/);
  assert.match(html, /อนุมัติ/);
  assert.match(script, /action.*approve|approve.*action/);
  assert.match(script, /action.*grant_beta|grant_beta.*action/);
});

test("schema supports usernames, regular members, and pending approval", async () => {
  const schema = await read("database/schema.vercel.sql");

  assert.match(schema, /username\s+VARCHAR/i);
  assert.match(schema, /'member'/);
  assert.match(schema, /'pending'/);
  assert.match(schema, /users_username/i);
});

test("login identity helpers normalize usernames and keep AI access explicit", async () => {
  const { canUseAi, isValidUsername, normalizeUsername, publicUser } = await import("../lib/vercel/auth.mjs");

  assert.equal(normalizeUsername("  oHizokao  "), "ohizokao");
  assert.equal(isValidUsername("oHizokao"), true);
  assert.equal(isValidUsername("ชื่อผู้ใช้"), false);
  assert.equal(canUseAi({ role: "admin", status: "active" }), true);
  assert.equal(canUseAi({ role: "member", status: "active", access_mode: "member" }), false);
  assert.equal(canUseAi({ role: "beta_user", status: "active", access_mode: "beta_unlimited", access_expires_at: new Date(Date.now() + 60_000) }), true);
  assert.equal(publicUser({ id: 1, username: "ohizokao", name: "Owner", password_hash: "secret" }).password_hash, undefined);
});
