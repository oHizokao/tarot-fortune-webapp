export const MEMORY_VERSION = 1;
const MAX_STORED_TURNS = 12;

function textValue(value, maxLength = 2000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function timestampValue(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function createReadingMemory(cards, createdAt = Date.now()) {
  const timestamp = timestampValue(createdAt, Date.now());
  return {
    version: MEMORY_VERSION,
    cards: Array.isArray(cards) ? cards.map((card) => String(card)) : [],
    initialQuestion: "",
    turns: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isMemoryForSpread(memory, cards) {
  return Boolean(
    memory &&
      Array.isArray(memory.cards) &&
      Array.isArray(cards) &&
      memory.cards.length > 0 &&
      memory.cards.length === cards.length &&
      memory.cards.every((card, index) => card === cards[index]),
  );
}

export function normalizeReadingMemory(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.cards)) return null;
  const fallbackTime = Date.now();
  const turns = Array.isArray(value.turns)
    ? value.turns
        .map((turn) => ({
          question: textValue(turn?.question),
          answer: textValue(turn?.answer, 12000),
          createdAt: timestampValue(turn?.createdAt, fallbackTime),
        }))
        .filter((turn) => turn.question && turn.answer)
        .slice(-MAX_STORED_TURNS)
    : [];
  const createdAt = timestampValue(value.createdAt, fallbackTime);
  return {
    version: MEMORY_VERSION,
    cards: value.cards.map((card) => String(card)),
    initialQuestion: textValue(value.initialQuestion || turns[0]?.question),
    turns,
    createdAt,
    updatedAt: timestampValue(value.updatedAt, createdAt),
  };
}

export function appendReadingTurn(memory, question, answer, updatedAt = Date.now()) {
  const normalized = normalizeReadingMemory(memory) || createReadingMemory([]);
  const nextQuestion = textValue(question);
  const nextAnswer = textValue(answer, 12000);
  if (!nextQuestion || !nextAnswer) return normalized;
  const timestamp = timestampValue(updatedAt, Date.now());
  const turns = [...normalized.turns, { question: nextQuestion, answer: nextAnswer, createdAt: timestamp }].slice(-MAX_STORED_TURNS);
  return {
    ...normalized,
    initialQuestion: normalized.initialQuestion || nextQuestion,
    turns,
    updatedAt: timestamp,
  };
}

export function conversationForSpread(memory, cards, maxTurns = 4) {
  if (!isMemoryForSpread(memory, cards)) return [];
  const turns = Array.isArray(memory.turns) ? memory.turns : [];
  if (!turns.length) return [];
  const limit = Math.max(1, Math.floor(Number(maxTurns) || 4));
  const recent = limit <= 1 ? [] : turns.slice(-(limit - 1));
  const selected = turns.length > recent.length ? [turns[0], ...recent] : recent;
  const unique = selected.filter((turn, index, all) => all.indexOf(turn) === index);
  return unique.flatMap((turn) => [
    { role: "user", content: turn.question },
    { role: "assistant", content: turn.answer },
  ]);
}
