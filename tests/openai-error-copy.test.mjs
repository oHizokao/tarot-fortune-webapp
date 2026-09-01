import assert from "node:assert/strict";
import test from "node:test";

test("invalid OpenAI credentials become an actionable admin error", async () => {
  const { requestOpenAi } = await import("../lib/vercel/openai.mjs");
  await assert.rejects(
    requestOpenAi({
      settings: { apiKey: "test-key", model: "gpt-5.6-luna", prompt: "safe" },
      input: "ping",
      userId: 7,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 }),
    }),
    (error) => error.code === "OPENAI_AUTH_FAILED" && error.status === 502,
  );
});

test("invalid OpenAI credentials have clear customer and admin copy", async () => {
  const { messageForError } = await import("../lib/client/error-copy.js");
  assert.match(messageForError("OPENAI_AUTH_FAILED"), /API key|คีย์/i);
  const adminSource = await (await import("node:fs/promises")).readFile(new URL("../admin/admin.js", import.meta.url), "utf8");
  assert.match(adminSource, /OPENAI_AUTH_FAILED/);
});
