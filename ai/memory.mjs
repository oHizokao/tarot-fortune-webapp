export const MEMORY_VERSION = 2;
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

export function createRoundMemory(sessionId = "", createdAt = Date.now()) {
  const timestamp = timestampValue(createdAt, Date.now());
  return {
    version: MEMORY_VERSION,
    sessionId: textValue(sessionId, 120),
    rounds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function appendRoundMemory(memory, round, updatedAt = Date.now()) {
  const base = memory && typeof memory === "object" && Array.isArray(memory.rounds)
    ? memory
    : createRoundMemory();
  if (!round || !Array.isArray(round.cards) || !round.cards.length) return base;
  const question = textValue(round.question);
  const answer = textValue(round.answer || round.answer_text, 12000);
  const timestamp = timestampValue(updatedAt, Date.now());
  const next = {
    id: textValue(round.id, 120) || `round-${base.rounds.length + 1}`,
    roundNumber: Number(round.roundNumber || round.round_number || base.rounds.length + 1),
    cards: round.cards.map((card) => String(card)),
    question,
    answer,
    structured: round.structured && typeof round.structured === "object" ? round.structured : null,
    createdAt: timestampValue(round.createdAt || round.created_at, timestamp),
  };
  const rounds = [...base.rounds.filter((item) => item?.id !== next.id), next].slice(-MAX_STORED_TURNS);
  return { ...base, rounds, updatedAt: timestamp };
}

export function normalizeRoundMemory(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.rounds)) return null;
  const normalized = createRoundMemory(value.sessionId, value.createdAt);
  const result = value.rounds.reduce((memory, round) => appendRoundMemory(memory, round, round?.updatedAt || round?.updated_at || value.updatedAt), normalized);
  return { ...result, updatedAt: timestampValue(value.updatedAt, result.updatedAt) };
}

export function conversationForRounds(memory, currentRoundNumber, maxRounds = 4) {
  const normalized = normalizeRoundMemory(memory);
  if (!normalized) return [];
  const current = Number(currentRoundNumber);
  const previous = normalized.rounds.filter((round) => Number(round.roundNumber) < current && round.question && round.answer);
  const limit = Math.max(1, Math.floor(Number(maxRounds) || 4));
  return previous.slice(-limit).flatMap((round) => [
    { role: "user", content: round.question },
    { role: "assistant", content: round.answer },
  ]);
}
