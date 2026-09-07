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

test("tarot request asks Responses API for the direct answer schema", async () => {
  const { buildOpenAiBody } = await import("../lib/vercel/openai.mjs");
  const body = buildOpenAiBody({ model: "gpt-5.6-luna", instructions: "safe", input: "question", userId: 7, responseFormat: "tarot" });
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.name, "tarot_reading");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.type, "object");
});

test("tarot Responses output is parsed into a direct answer", async () => {
  const { requestOpenAi } = await import("../lib/vercel/openai.mjs");
  const response = await requestOpenAi({
    settings: { apiKey: "test-key", model: "gpt-5.6-luna", prompt: "safe" },
    input: "question",
    userId: 7,
    responseFormat: "tarot",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.text.format.name, "tarot_reading");
      return new Response(JSON.stringify({
        id: "resp-tarot-test",
        output_text: JSON.stringify({ verdict: "ควรไปต่อ", cards: [{ position: 1, name: "Growth", meaning: "เติบโต", prediction: "เริ่มลงมือ" }], overall_prediction: "คำทำนายโดยรวมคือไปต่อ", safety_note: "" }),
        usage: { input_tokens: 10, output_tokens: 20 },
      }), { status: 200 });
    },
  });
  assert.equal(response.structured.verdict, "ควรไปต่อ");
  assert.match(response.answer, /คำฟันธง: ควรไปต่อ/);
  assert.match(response.answer, /คำทำนายโดยรวมคือไปต่อ/);
});

test("OpenAI 429 responses become an actionable rate-limit error", async () => {
  const { requestOpenAi } = await import("../lib/vercel/openai.mjs");
  await assert.rejects(
    requestOpenAi({
      settings: { apiKey: "test-key", model: "gpt-5.6-luna", prompt: "safe" },
      input: "ping",
      userId: 7,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }),
    }),
    (error) => error.code === "AI_RATE_LIMITED" && error.status === 429,
  );
});

test("tarot input contains only the selected card words", async () => {
  const { buildTarotInput } = await import("../lib/vercel/openai.mjs");
  const input = buildTarotInput("งานนี้ควรไปต่อไหม", [{ file: "card-078.webp", name: "Worry", keywords: ["worry"] }], []);
  assert.match(input, /Worry/);
  assert.match(input, /worry/);
  assert.doesNotMatch(input, /card-001\.webp/);
});
