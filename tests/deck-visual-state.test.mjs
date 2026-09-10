import test from "node:test";
import assert from "node:assert/strict";
import { commitVisualRound } from "../ai/deck-visual-state.mjs";

function emptyState() {
  return { sessionKey: "member:session-1", usedIndexes: [], rounds: [] };
}

test("commits only the sparse positions the user selected", () => {
  const next = commitVisualRound(emptyState(), {
    requestId: "draw-1",
    roundId: "round-1",
    selectedIndexes: [0, 20, 50],
    cards: ["card-001.webp", "card-002.webp", "card-003.webp"],
  });

  assert.deepEqual(next.usedIndexes, [0, 20, 50]);
  assert.deepEqual(next.rounds[0].selectedIndexes, [0, 20, 50]);
});

test("replaying one draw is idempotent and a follow-up adds only its new positions", () => {
  const first = commitVisualRound(emptyState(), {
    requestId: "draw-1",
    roundId: "round-1",
    selectedIndexes: [10, 30, 70],
    cards: ["card-001.webp", "card-002.webp", "card-003.webp"],
  });
  const replay = commitVisualRound(first, {
    requestId: "draw-1",
    roundId: "round-1",
    selectedIndexes: [10, 30, 70],
    cards: ["card-001.webp", "card-002.webp", "card-003.webp"],
  });
  const followUp = commitVisualRound(replay, {
    requestId: "draw-2",
    roundId: "round-2",
    selectedIndexes: [4, 61],
    cards: ["card-004.webp", "card-005.webp"],
  });

  assert.deepEqual(replay, first);
  assert.deepEqual(followUp.usedIndexes, [4, 10, 30, 61, 70]);
  assert.equal(followUp.rounds.length, 2);
});

test("rejects invalid, duplicate, and already committed positions", () => {
  assert.throws(() => commitVisualRound(emptyState(), {
    requestId: "draw-1",
    roundId: "round-1",
    selectedIndexes: [0, 0, 20],
    cards: ["card-001.webp", "card-002.webp", "card-003.webp"],
  }), /ซ้ำ/);

  assert.throws(() => commitVisualRound(emptyState(), {
    requestId: "draw-1",
    roundId: "round-1",
    selectedIndexes: [0, 78],
    cards: ["card-001.webp", "card-002.webp"],
  }), /0–77/);

  const committed = commitVisualRound(emptyState(), {
    requestId: "draw-1",
    roundId: "round-1",
    selectedIndexes: [0],
    cards: ["card-001.webp"],
  });
  assert.throws(() => commitVisualRound(committed, {
    requestId: "draw-2",
    roundId: "round-2",
    selectedIndexes: [0],
    cards: ["card-002.webp"],
  }), /ถูกเปิดไปแล้ว/);
});
