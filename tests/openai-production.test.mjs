import assert from "node:assert/strict";
import test from "node:test";

test("Luna production request is bounded and private", async () => {
  const { buildOpenAiBody } = await import("../lib/vercel/openai.mjs");
  const body = buildOpenAiBody({ model: "gpt-5.6-luna", instructions: "safe", input: "question", userId: 7 });
  assert.equal(body.model, "gpt-5.6-luna");
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 900);
  assert.match(body.safety_identifier, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(body), /sk-|api[_-]?key|postgres/i);
});

test("connection test is bounded to a short response", async () => {
  const { buildOpenAiBody } = await import("../lib/vercel/openai.mjs");
  const body = buildOpenAiBody({ model: "gpt-5.6-luna", instructions: "safe", input: "ping", userId: 7, maxOutputTokens: 20 });
  assert.equal(body.max_output_tokens, 20);
  assert.equal(body.store, false);
});

test("tarot input contains only the selected card words", async () => {
  const { buildTarotInput } = await import("../lib/vercel/openai.mjs");
  const input = buildTarotInput("งานนี้ควรไปต่อไหม", [{ file: "card-078.webp", name: "Worry", keywords: ["worry"] }], []);
  assert.match(input, /Worry/);
  assert.match(input, /worry/);
  assert.doesNotMatch(input, /card-001\.webp/);
});
