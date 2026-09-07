const DECK_SIZE = 78;
const CARD_FILE_PATTERN = /^card-(\d{3})\.webp$/;
const MAX_ROUNDS = DECK_SIZE;

export const DECK = Array.from({ length: DECK_SIZE }, (_, index) => `card-${String(index + 1).padStart(3, "0")}.webp`);

export function shuffleDeck(items = DECK, randomFn = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const raw = Number(randomFn());
    const fraction = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
    const randomIndex = Math.floor(fraction * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

export function createLocalDeckSession(randomFn = Math.random) {
  const timestamp = Date.now();
  return {
    version: 2,
    deckOrder: shuffleDeck(DECK, randomFn),
    cursor: 0,
    rounds: [],
    activeQuestion: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function drawNextRound(session, count, question = "", idFactory = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  const normalized = normalizeLocalDeckSession(session) || createLocalDeckSession();
  const requested = Number(count);
  if (!Number.isInteger(requested) || requested < 1 || requested > 3) throw new Error("เลือกไพ่ได้ครั้งละ 1–3 ใบ");
  if (normalized.cursor + requested > normalized.deckOrder.length) throw new Error("ไพ่ไม่พอในสำรับสำหรับจำนวนที่เลือก");
  const cards = normalized.deckOrder.slice(normalized.cursor, normalized.cursor + requested);
  const timestamp = Date.now();
  const round = {
    id: String(idFactory()),
    roundNumber: normalized.rounds.length + 1,
    cards,
    question: textValue(question),
    answer: "",
    structured: null,
    status: "drawn",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const next = {
    ...normalized,
    cursor: normalized.cursor + requested,
    rounds: [...normalized.rounds, round].slice(-MAX_ROUNDS),
    activeQuestion: round.question,
    updatedAt: timestamp,
  };
  return { session: next, round };
}

export function appendRoundAnswer(session, roundId, answer, structured = null) {
  const normalized = normalizeLocalDeckSession(session) || createLocalDeckSession();
  const timestamp = Date.now();
  return {
    ...normalized,
    rounds: normalized.rounds.map((round) => round.id === String(roundId)
      ? { ...round, answer: textValue(answer, 12000), structured: structured && typeof structured === "object" ? structured : null, status: "answered", updatedAt: timestamp }
      : round),
    updatedAt: timestamp,
  };
}

export function resetLocalDeckSession(_session, randomFn = Math.random) {
  return createLocalDeckSession(randomFn);
}

export function normalizeLocalDeckSession(value) {
  if (!value || typeof value !== "object") return null;
  const deckOrder = normalizeDeck(value.deckOrder)
    || migrateDeckOrder(value.openedCards, value.remaining);
  if (!deckOrder) return null;
  const cursor = Number(value.cursor ?? value.openedCount ?? (Array.isArray(value.openedCards) ? value.openedCards.length : 0));
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > DECK_SIZE) return null;
  const rounds = normalizeRounds(value.rounds, value.history);
  const createdAt = numberValue(value.createdAt, Date.now());
  return {
    version: 2,
    deckOrder,
    cursor,
    rounds,
    activeQuestion: textValue(value.activeQuestion),
    createdAt,
    updatedAt: numberValue(value.updatedAt, createdAt),
  };
}

function normalizeRounds(roundsValue, historyValue) {
  const source = Array.isArray(roundsValue)
    ? roundsValue
    : Array.isArray(historyValue) ? [...historyValue].reverse() : [];
  const used = new Set();
  return source.map((entry, index) => {
    const cards = normalizeCards(entry?.cards);
    if (!cards || cards.some((card) => used.has(card))) return null;
    cards.forEach((card) => used.add(card));
    const answer = textValue(entry?.answer || entry?.answer_text, 12000);
    return {
      id: textValue(entry?.id) || `round-${index + 1}`,
      roundNumber: Number(entry?.roundNumber || entry?.round_number || index + 1),
      cards,
      question: textValue(entry?.question),
      answer,
      structured: entry?.structured && typeof entry.structured === "object" ? entry.structured : entry?.answer && typeof entry.answer === "object" ? entry.answer : null,
      status: entry?.status || (answer ? "answered" : "drawn"),
      createdAt: numberValue(entry?.createdAt || entry?.created_at, 0),
      updatedAt: numberValue(entry?.updatedAt || entry?.updated_at, numberValue(entry?.createdAt || entry?.created_at, 0)),
    };
  }).filter(Boolean).slice(-MAX_ROUNDS);
}

function migrateDeckOrder(openedValue, remainingValue) {
  const opened = normalizeCards(openedValue) || [];
  const remaining = normalizeCards(remainingValue);
  if (!remaining) return null;
  const combined = [...opened, ...remaining.filter((card) => !opened.includes(card))];
  return combined.length === DECK_SIZE && new Set(combined).size === DECK_SIZE ? combined : null;
}

function normalizeDeck(value) {
  const cards = normalizeCards(value);
  return cards?.length === DECK_SIZE && new Set(cards).size === DECK_SIZE ? cards : null;
}

function normalizeCards(value) {
  if (!Array.isArray(value)) return null;
  const cards = value.map((card) => String(card || ""));
  return cards.length && cards.every(isCardFile) && new Set(cards).size === cards.length ? cards : null;
}

function isCardFile(value) {
  const match = String(value).match(CARD_FILE_PATTERN);
  const number = Number(match?.[1]);
  return Number.isInteger(number) && number >= 1 && number <= DECK_SIZE;
}

function textValue(value, maxLength = 2_000) { return String(value ?? "").trim().slice(0, maxLength); }
function numberValue(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
