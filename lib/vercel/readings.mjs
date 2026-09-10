import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./db.mjs";

const CARD_FILE_PATTERN = /^card-(?:00[1-9]|0[1-6][0-9]|07[0-8])\.webp$/;
export const FULL_DECK_FILES = Array.from({ length: 78 }, (_, index) => `card-${String(index + 1).padStart(3, "0")}.webp`);
let cardsPromise;

export function createReadingId() {
  return randomUUID();
}

export function createDeckOrder(randomFn = Math.random) {
  const deck = [...FULL_DECK_FILES];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const raw = Number(randomFn());
    const fraction = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
    const swapIndex = Math.floor(fraction * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function allocateDeckSlice(session, count) {
  const deck = parseJsonArray(session?.deck_order).map((card) => String(card));
  if (deck.length !== FULL_DECK_FILES.length || new Set(deck).size !== deck.length || deck.some((card) => !CARD_FILE_PATTERN.test(card))) {
    throw new AppError("สำรับไพ่ของคุณยังไม่พร้อมใช้งาน กรุณาเริ่มสำรับใหม่", 409, "DECK_NOT_READY");
  }
  const requested = Number(count);
  const cursor = Number(session?.draw_cursor || 0);
  if (!Number.isInteger(requested) || requested < 1 || requested > 3) throw new AppError("เลือกไพ่ได้ครั้งละ 1–3 ใบ", 422, "INVALID_DRAW_COUNT");
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > deck.length) throw new AppError("ตำแหน่งสำรับไพ่ไม่ถูกต้อง กรุณาเริ่มสำรับใหม่", 409, "DECK_NOT_READY");
  if (cursor + requested > deck.length) throw new AppError("ไพ่ไม่พอในสำรับสำหรับจำนวนที่เลือก", 409, "DECK_EXHAUSTED");
  return { cards: deck.slice(cursor, cursor + requested), nextCursor: cursor + requested };
}

export function validateReadingCards(cards) {
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 3) throw new AppError("ต้องส่งไพ่ที่เปิด 1–3 ใบ", 422, "INVALID_CARDS");
  const result = cards.map((card) => String(card || ""));
  if (result.some((card) => !CARD_FILE_PATTERN.test(card))) throw new AppError("พบชื่อไฟล์ไพ่ที่ไม่อนุญาต", 422, "INVALID_CARD_FILE");
  if (new Set(result).size !== result.length) throw new AppError("ไพ่ในคำถามต้องไม่ซ้ำกัน", 422, "DUPLICATE_CARDS");
  return result;
}

export function assertReadingOwner(reading, userId) {
  if (!reading || Number(reading.user_id) !== Number(userId)) throw new AppError("ไม่พบชุดไพ่ของคุณ", 404, "READING_NOT_FOUND");
  return reading;
}

export function readingContext(reading) {
  const cards = Array.isArray(reading?.cards)
    ? reading.cards.map((card) => String(card))
    : parseJsonArray(reading?.cards);
  const messages = Array.isArray(reading?.messages) ? reading.messages.map(normalizeMessage).filter(Boolean) : [];
  return { cards, messages };
}

export function normalizeReading(reading, messages = undefined) {
  if (!reading) return null;
  const context = readingContext({ ...reading, messages: messages ?? reading.messages });
  return {
    id: String(reading.id),
    cards: context.cards,
    title: String(reading.title || "คำถามใหม่"),
    status: String(reading.status || "active"),
    created_at: reading.created_at,
    updated_at: reading.updated_at,
    messages: context.messages,
  };
}

export function normalizeRound(round) {
  if (!round) return null;
  return {
    id: String(round.id),
    session_id: String(round.session_id),
    round_number: Number(round.round_number || 0),
    question: String(round.question || ""),
    cards: parseJsonArray(round.cards).map((card) => String(card)),
    selected_indexes: round.selected_indexes == null ? null : parseJsonArray(round.selected_indexes).map((index) => Number(index)),
    answer: parseJsonObject(round.answer_json),
    answer_text: round.answer_text ? String(round.answer_text) : "",
    status: String(round.status || "drawn"),
    request_id: round.request_id ? String(round.request_id) : "",
    created_at: round.created_at,
    updated_at: round.updated_at,
  };
}

export function validateSelectedIndexes(value, expectedCount) {
  if (!Array.isArray(value) || value.length !== Number(expectedCount)) {
    throw new AppError("ตำแหน่งไพ่ต้องตรงกับจำนวนไพ่ที่เปิด", 422, "INVALID_SELECTED_INDEXES");
  }
  const indexes = value.map((index) => Number(index));
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= 78)) {
    throw new AppError("ตำแหน่งไพ่ต้องอยู่ระหว่าง 0–77", 422, "INVALID_SELECTED_INDEXES");
  }
  if (new Set(indexes).size !== indexes.length) {
    throw new AppError("ตำแหน่งไพ่ต้องไม่ซ้ำกัน", 422, "DUPLICATE_SELECTED_INDEXES");
  }
  return indexes;
}

export function normalizeDeckSession(session, rounds = []) {
  if (!session) return null;
  const storedDeck = parseJsonArray(session.deck_order);
  const deckReady = storedDeck.length === FULL_DECK_FILES.length && new Set(storedDeck).size === storedDeck.length && storedDeck.every((card) => CARD_FILE_PATTERN.test(String(card)));
  const deckSize = FULL_DECK_FILES.length;
  const cursor = Math.max(0, Number(session.draw_cursor || 0));
  const openedCount = Math.max(0, Number(session.opened_count ?? cursor));
  return {
    id: String(session.id),
    title: String(session.title || "คำถามใหม่"),
    status: String(session.status || "active"),
    draw_cursor: cursor,
    opened_count: openedCount,
    deck_size: deckSize,
    deck_ready: deckReady,
    remaining: deckReady ? Math.max(0, deckSize - cursor) : 0,
    created_at: session.created_at,
    updated_at: session.updated_at,
    rounds: Array.isArray(rounds) ? rounds.map(normalizeRound).filter(Boolean) : [],
  };
}

export async function cardMetadata(cardFiles) {
  const files = validateReadingCards(cardFiles);
  if (!cardsPromise) cardsPromise = readFile(path.join(process.cwd(), "data", "cards.json"), "utf8").then((raw) => JSON.parse(raw));
  const decoded = await cardsPromise;
  const byFile = new Map((decoded.cards || []).map((card) => [card.file, card]));
  return files.map((file) => {
    const card = byFile.get(file);
    if (!card) throw new AppError("ยังไม่มี metadata ของไพ่ที่เลือก", 503, "CARD_METADATA_MISSING");
    return card;
  });
}

function normalizeMessage(message) {
  if (!message || !["user", "assistant"].includes(message.role)) return null;
  const content = String(message.content || "").trim();
  if (!content) return null;
  return { id: message.id ? Number(message.id) : undefined, role: message.role, content, model: message.model || null, created_at: message.created_at };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "null"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
