import assert from "node:assert/strict";
import test from "node:test";

import {
  appendReadingTurn,
  conversationForSpread,
  createReadingMemory,
  isMemoryForSpread,
  normalizeReadingMemory,
} from "../ai/memory.mjs";

const cards = ["card-012.webp", "card-044.webp"];

test("memory keeps the first reading and makes follow-up questions reuse the same spread", () => {
  let memory = createReadingMemory(cards, 1000);
  memory = appendReadingTurn(memory, "งานนี้ควรไปต่อไหม", "ลองดูทางเลือกที่ทำได้ทีละขั้น", 2000);

  assert.equal(isMemoryForSpread(memory, cards), true);
  assert.deepEqual(conversationForSpread(memory, cards), [
    { role: "user", content: "งานนี้ควรไปต่อไหม" },
    { role: "assistant", content: "ลองดูทางเลือกที่ทำได้ทีละขั้น" },
  ]);
  assert.equal(memory.initialQuestion, "งานนี้ควรไปต่อไหม");
});

test("memory never crosses into a new spread and can be restored from local storage", () => {
  const memory = appendReadingTurn(
    createReadingMemory(cards, 1000),
    "คำถามเดิม",
    "คำตอบเดิม",
    2000,
  );

  assert.equal(isMemoryForSpread(memory, ["card-012.webp", "card-045.webp"]), false);
  assert.deepEqual(conversationForSpread(memory, ["card-012.webp", "card-045.webp"]), []);
  assert.deepEqual(normalizeReadingMemory(JSON.parse(JSON.stringify(memory))), memory);
});

test("memory keeps the original turn while limiting long follow-up context", () => {
  let memory = createReadingMemory(["card-001.webp"], 1000);
  for (let index = 1; index <= 6; index += 1) {
    memory = appendReadingTurn(memory, `คำถาม ${index}`, `คำตอบ ${index}`, 1000 + index);
  }

  const conversation = conversationForSpread(memory, ["card-001.webp"], 4);
  assert.deepEqual(conversation.slice(0, 2), [
    { role: "user", content: "คำถาม 1" },
    { role: "assistant", content: "คำตอบ 1" },
  ]);
  assert.deepEqual(conversation.slice(-2), [
    { role: "user", content: "คำถาม 6" },
    { role: "assistant", content: "คำตอบ 6" },
  ]);
  assert.equal(conversation.length, 8);
});

test("empty memory never matches an empty spread and a one-turn limit keeps only the original answer", () => {
  const empty = createReadingMemory([]);
  assert.equal(isMemoryForSpread(empty, []), false);

  let memory = createReadingMemory(["card-001.webp"], 1000);
  memory = appendReadingTurn(memory, "คำถามแรก", "คำตอบแรก", 1001);
  memory = appendReadingTurn(memory, "คำถามต่อ", "คำตอบต่อ", 1002);
  assert.deepEqual(conversationForSpread(memory, ["card-001.webp"], 1), [
    { role: "user", content: "คำถามแรก" },
    { role: "assistant", content: "คำตอบแรก" },
  ]);
});
