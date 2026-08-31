import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("security headers block framing and unsafe browser capabilities", async () => {
  const config = JSON.parse(await fs.readFile("vercel.json", "utf8"));
  const text = JSON.stringify(config.headers);
  assert.match(text, /frame-ancestors 'none'/);
  assert.match(text, /X-Content-Type-Options/);
  assert.match(text, /Permissions-Policy/);
});

test("API failures carry a request id without raw upstream details", async () => {
  const { endpoint } = await import("../lib/vercel/http.mjs");
  const handler = endpoint(() => { throw new Error("secret upstream response"); });
  const response = await handler(new Request("https://tarot.example/api/test", { method: "GET" }));
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.match(response.headers.get("x-request-id") || "", /^[0-9a-f-]{36}$/i);
  assert.equal(body.request_id, response.headers.get("x-request-id"));
  assert.doesNotMatch(JSON.stringify(body), /secret upstream/);
});
