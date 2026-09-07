import assert from "node:assert/strict";
import test from "node:test";

import { appendRoundAnswer, createLocalDeckSession, drawNextRound, normalizeLocalDeckSession, resetLocalDeckSession } from "../ai/deck-session.mjs";

test("local deck keeps one order across multiple rounds", () => {
  let session = createLocalDeckSession(() => 0.5);
  const first = drawNextRound(session, 3, "คำถามแรก", () => "round-1");
  session = first.session;
  const second = drawNextRound(session, 2, "คำถามต่อ", () => "round-2");
  session = second.session;

  assert.equal(session.rounds.length, 2);
  assert.equal(session.cursor, 5);
  assert.equal(session.deckOrder.length, 78);
  assert.equal(new Set([...first.round.cards, ...second.round.cards]).size, 5);
  assert.equal(session.deckOrder.slice(0, 5).join("|"), [...first.round.cards, ...second.round.cards].join("|"));
  assert.equal(session.deckOrder.length - session.cursor, 73);
});

test("round answers stay attached to the round and reset starts a new deck", () => {
  let session = createLocalDeckSession(() => 0.25);
  const drawn = drawNextRound(session, 1, "จะไปต่อไหม", () => "round-1");
  session = appendRoundAnswer(drawn.session, "round-1", "ควรไปต่อ", { verdict: "ควรไปต่อ" });
  assert.equal(session.rounds[0].answer, "ควรไปต่อ");
  assert.equal(session.rounds[0].structured.verdict, "ควรไปต่อ");
  const reset = resetLocalDeckSession(session, () => 0.75);
  assert.equal(reset.rounds.length, 0);
  assert.equal(reset.cursor, 0);
  assert.equal(reset.deckOrder.length, 78);
});

test("old local reading state migrates without losing opened cards", () => {
  const remaining = Array.from({ length: 78 }, (_, index) => `card-${String(index + 1).padStart(3, "0")}.webp`).slice(2);
  const normalized = normalizeLocalDeckSession({
    remaining,
    openedCards: ["card-001.webp", "card-002.webp"],
    history: [{ id: "old-round", cards: ["card-001.webp", "card-002.webp"], createdAt: 100 }],
  });
  assert.equal(normalized.cursor, 2);
  assert.deepEqual(normalized.deckOrder.slice(0, 4), ["card-001.webp", "card-002.webp", "card-003.webp", "card-004.webp"]);
  assert.deepEqual(normalized.rounds[0].cards, ["card-001.webp", "card-002.webp"]);
});
