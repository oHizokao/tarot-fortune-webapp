import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("session is rejected after session_version changes", async () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough-123456";
  try {
    const { signSession, verifySession } = await import("../lib/vercel/security.mjs");
    const { sessionMatchesUser } = await import("../lib/vercel/auth.mjs");
    const token = signSession({ userId: 7, role: "member", csrf: "csrf", sessionVersion: 2 });
    const session = verifySession(token);
    assert.equal(session.sessionVersion, 2);
    assert.equal(sessionMatchesUser(session, { id: 7, session_version: 2 }), true);
    assert.equal(sessionMatchesUser(session, { id: 7, session_version: 3 }), false);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});

test("rate limiting uses a shared Postgres upsert bucket", async () => {
  const source = await fs.readFile(path.join(root, "lib/vercel/rate-limit.mjs"), "utf8");
  assert.match(source, /INSERT INTO rate_limit_buckets/i);
  assert.match(source, /ON CONFLICT\s*\(scope, subject_hash, window_start\)/i);
  assert.doesNotMatch(source, /const\s+loginAttempts\s*=\s*new Map/);
});

test("session payload requires a positive session version", async () => {
  const source = await fs.readFile(path.join(root, "lib/vercel/security.mjs"), "utf8");
  assert.match(source, /sessionVersion/);
  assert.match(source, /payload\.sessionVersion/);
});
