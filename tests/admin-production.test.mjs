import assert from "node:assert/strict";
import test from "node:test";

test("audit details remove secrets", async () => {
  const { safeAuditDetails } = await import("../lib/vercel/audit.mjs");
  assert.deepEqual(safeAuditDetails({ target: 8, password: "secret", apiKey: "sk-secret", hash: "bcrypt" }), { target: 8 });
});

test("admin operations expose quota and temporary-password controls", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("lib/vercel/routes/admin.mjs", "utf8");
  assert.match(source, /set_daily_limit/);
  assert.match(source, /reset_password/);
  assert.match(source, /revoke_sessions/);
  assert.match(source, /writeAudit/);
});

test("admin delete audits a removed user without keeping a deleted foreign-key target", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("lib/vercel/routes/admin.mjs", "utf8");
  const deleteBlock = source.match(/else if \(action === "delete"\) \{[\s\S]*?\n  \} else if \(action === "set_daily_limit"\)/)?.[0] || "";

  assert.match(deleteBlock, /DELETE FROM users/);
  assert.doesNotMatch(deleteBlock, /targetUserId: id/);
  assert.match(deleteBlock, /deleted_user_id/);
});

test("admin logout clears credentials and sensitive setup fields from the page", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("admin/admin.js", "utf8");

  assert.match(source, /admin-username.*value\s*=\s*["']{2}/s);
  assert.match(source, /admin-password.*value\s*=\s*["']{2}/s);
  assert.match(source, /bootstrap-secret.*value\s*=\s*["']{2}/s);
  assert.match(source, /bootstrap-password.*value\s*=\s*["']{2}/s);
  assert.match(source, /openai-api-key.*value\s*=\s*["']{2}/s);
});
