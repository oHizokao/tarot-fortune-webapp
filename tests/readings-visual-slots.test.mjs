import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRound, validateSelectedIndexes } from "../lib/vercel/readings.mjs";

test("normalizes the persisted visual slots without changing card order", () => {
  const round = normalizeRound({
    id: "round-1",
    session_id: "session-1",
    round_number: 1,
    question: "คำถาม",
    cards: JSON.stringify(["card-001.webp", "card-002.webp", "card-003.webp"]),
    selected_indexes: JSON.stringify([50, 0, 20]),
    status: "drawn",
  });

  assert.deepEqual(round.selected_indexes, [50, 0, 20]);
});

test("validates selected visual slots against the requested draw count", () => {
  assert.deepEqual(validateSelectedIndexes([0, 20, 50], 3), [0, 20, 50]);
  assert.throws(() => validateSelectedIndexes([0, 20], 3), /ตรงกับจำนวน/);
  assert.throws(() => validateSelectedIndexes([0, 0, 20], 3), /ไม่ซ้ำ/);
  assert.throws(() => validateSelectedIndexes([78], 1), /0–77/);
});
