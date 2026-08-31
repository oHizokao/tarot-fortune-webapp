import assert from "node:assert/strict";
import test from "node:test";

test("a reading never crosses user accounts", async () => {
  const { assertReadingOwner } = await import("../lib/vercel/readings.mjs");
  const reading = { id: "11111111-1111-4111-8111-111111111111", user_id: 10, cards: ["card-001.webp"] };
  assert.throws(() => assertReadingOwner(reading, 11), (error) => error.code === "READING_NOT_FOUND");
  assert.equal(assertReadingOwner(reading, 10).id, reading.id);
});

test("follow-up context keeps the original cards", async () => {
  const { readingContext } = await import("../lib/vercel/readings.mjs");
  assert.deepEqual(readingContext({ cards: ["card-001.webp"], messages: [] }).cards, ["card-001.webp"]);
});

test("reading IDs are UUIDs and card spreads are unique", async () => {
  const { createReadingId, validateReadingCards } = await import("../lib/vercel/readings.mjs");
  assert.match(createReadingId(), /^[0-9a-f-]{36}$/i);
  assert.deepEqual(validateReadingCards(["card-001.webp", "card-078.webp"]), ["card-001.webp", "card-078.webp"]);
  assert.throws(() => validateReadingCards(["card-001.webp", "card-001.webp"]), /ไม่ซ้ำ/);
});
