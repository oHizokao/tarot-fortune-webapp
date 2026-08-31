import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./db.mjs";

const CARD_FILE_PATTERN = /^card-(?:00[1-9]|0[1-6][0-9]|07[0-8])\.webp$/;
let cardsPromise;

export function createReadingId() {
  return randomUUID();
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
