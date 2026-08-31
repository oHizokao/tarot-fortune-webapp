import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production migration is additive and idempotent", async () => {
  const sql = await fs.readFile(path.join(root, "database/migrations/001_production_foundation.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS schema_migrations/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS reading_sessions/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rate_limit_buckets/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS daily_ai_limit/i);
  assert.match(sql, /ON CONFLICT\s*\(version\)\s*DO NOTHING/i);
});

test("fresh schema includes the production tables", async () => {
  const sql = await fs.readFile(path.join(root, "database/schema.vercel.sql"), "utf8");
  for (const table of ["schema_migrations", "rate_limit_buckets", "reading_sessions", "reading_messages", "admin_audit_log"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
  assert.match(sql, /daily_ai_limit\s+INTEGER/i);
  assert.match(sql, /session_version\s+INTEGER/i);
});
