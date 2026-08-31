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

test("readiness requires every production dependency", () => {
  assert.equal(redactReadiness({ database: { ok: true }, schema: { ok: true }, admin: { ok: true }, openai: { ok: true } }).ready, true);
  assert.equal(redactReadiness({ database: { ok: true }, schema: { ok: true }, admin: { ok: false }, openai: { ok: true } }).ready, false);
});
