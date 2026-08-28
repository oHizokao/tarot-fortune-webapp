import assert from "node:assert/strict";
import test from "node:test";

function handlerFor(module, method) {
  return module[method] || module.default?.fetch || module.default;
}

test("health function returns JSON without requiring a database", async () => {
  const handler = handlerFor(await import("../api/health.mjs"), "GET");
  const response = await handler(new Request("https://tarot.example/api/health", { method: "GET" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.runtime, "vercel-node");
});

test("auth session reports missing Vercel database instead of pretending to be logged out", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const handler = handlerFor(await import("../api/auth/[...route].mjs"), "GET");
    const response = await handler(new Request("https://tarot.example/api/auth/me", { method: "GET" }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.backend_configured, false);
    assert.equal(body.authenticated, false);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("AI card validation rejects fake and duplicate cards", async () => {
  const { validCardFiles } = await import("../api/ai/tarot-chat.mjs");
  assert.deepEqual(validCardFiles(["card-001.webp", "card-078.webp"]), ["card-001.webp", "card-078.webp"]);
  assert.throws(() => validCardFiles(["card-999.webp"]), /ไม่อนุญาต/);
  assert.throws(() => validCardFiles(["card-001.webp", "card-001.webp"]), /ไม่ซ้ำ/);
});

test("AI input contains the exact selected card words and not arbitrary labels", async () => {
  const { buildInput } = await import("../api/ai/tarot-chat.mjs");
  const input = buildInput("งานที่ทำอยู่ควรไปต่อไหม", [
    { file: "card-078.webp", name: "Worry", keywords: ["worry"] },
  ], []);
  assert.match(input, /card-078\.webp/);
  assert.match(input, /Worry/);
  assert.doesNotMatch(input, /card-001\.webp/);
});

test("AI input keeps the original reading context alongside the latest follow-up", async () => {
  const { buildInput } = await import("../api/ai/tarot-chat.mjs");
  const conversation = [
    { role: "user", content: "คำถามตั้งต้น" },
    { role: "assistant", content: "คำตอบตั้งต้น" },
    { role: "user", content: "คำถามต่อเนื่อง 1" },
    { role: "assistant", content: "คำตอบต่อเนื่อง 1" },
    { role: "user", content: "คำถามต่อเนื่องล่าสุด" },
    { role: "assistant", content: "คำตอบล่าสุด" },
  ];
  const input = buildInput("ขอถามต่อจากเรื่องเดิม", [{ file: "card-001.webp", name: "Worry", keywords: ["worry"] }], conversation);

  assert.match(input, /USER: คำถามตั้งต้น/);
  assert.match(input, /ASSISTANT: คำตอบตั้งต้น/);
  assert.match(input, /USER: คำถามต่อเนื่องล่าสุด/);
  assert.match(input, /ASSISTANT: คำตอบล่าสุด/);
});
