import { AppError, query, transaction } from "../db.mjs";
import { requireBetaUser, requireCsrf } from "../auth.mjs";
import { assertSameOrigin, parseJson, requireMethod, stringValue, success } from "../http.mjs";
import { enforceAiRateLimit } from "../rate-limit.mjs";
import { getOpenAiSettings } from "../settings.mjs";
import { hashText } from "../security.mjs";
import { buildTarotInput, composeTarotInstructions, createTarotResponse } from "../openai.mjs";
import { assertReadingOwner, cardMetadata, createReadingId, normalizeReading, readingContext, validateReadingCards } from "../readings.mjs";

export async function createReading(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const data = await parseJson(request);
  const cards = validateReadingCards(data.cards);
  const rows = await query(
    "INSERT INTO reading_sessions (id, user_id, cards, title, status, created_at, updated_at) VALUES ($1, $2, $3::jsonb, $4, 'active', NOW(), NOW()) RETURNING *",
    [createReadingId(), Number(current.user.id), JSON.stringify(cards), String(data.title || "คำถามใหม่").trim().slice(0, 160) || "คำถามใหม่"],
  );
  return success({ reading: normalizeReading(rows[0]) }, { status: 201 });
}

export async function listReadings(request) {
  requireMethod(request, "GET");
  const current = await requireBetaUser(request);
  const rows = await query("SELECT * FROM reading_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20", [Number(current.user.id)]);
  return success({ readings: rows.map((row) => normalizeReading(row)) });
}

export async function getReading(request, id) {
  requireMethod(request, "GET");
  const current = await requireBetaUser(request);
  const reading = await ownedReading(id, current.user.id);
  const messages = await query("SELECT id, role, content, model, created_at FROM reading_messages WHERE session_id = $1 ORDER BY id ASC", [reading.id]);
  return success({ reading: normalizeReading(reading, messages) });
}

export async function addMessage(request, id) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const data = await parseJson(request);
  const question = stringValue(data.question, "คำถาม ", 2_000);
  const reading = await ownedReading(id, current.user.id);
  if (reading.status !== "active") throw new AppError("ชุดไพ่นี้ปิดแล้ว กรุณาเปิดชุดใหม่เพื่อถามเรื่องใหม่", 409, "READING_CLOSED");
  const messageRows = await query("SELECT role, content, model, created_at FROM reading_messages WHERE session_id = $1 ORDER BY id ASC", [reading.id]);
  const metadata = await cardMetadata(readingContext(reading).cards);
  const settings = await getOpenAiSettings();
  await enforceAiRateLimit(current.user.id);
  const content = await createTarotResponse({ userId: current.user.id, question, cards: metadata, messages: messageRows, settings, dailyLimit: current.user.daily_ai_limit, });
  const logContent = String(process.env.LOG_AI_CONTENT || "0") === "1";
  const [inserted] = await transaction([
    { text: "INSERT INTO ai_usage (user_id, question_hash, question_text, answer_text, card_ids, model, response_id, request_status, input_tokens, output_tokens, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'success', $8, $9, NOW()) RETURNING id", params: [Number(current.user.id), hashText(question), logContent ? question : null, logContent ? content.answer : null, JSON.stringify(readingContext(reading).cards), settings.model, content.responseId || null, content.usage.input_tokens, content.usage.output_tokens] },
    { text: "INSERT INTO reading_messages (session_id, role, content, model, response_id, input_tokens, output_tokens, created_at) VALUES ($1, 'user', $2, $3, NULL, 0, 0, NOW()), ($1, 'assistant', $4, $3, $5, $6, $7, NOW())", params: [reading.id, question, settings.model, content.answer, content.responseId || null, content.usage.input_tokens, content.usage.output_tokens] },
    { text: "UPDATE reading_sessions SET updated_at = NOW() WHERE id = $1 AND user_id = $2", params: [reading.id, Number(current.user.id)] },
    { text: "UPDATE users SET last_ai_used_at = NOW(), updated_at = NOW() WHERE id = $1", params: [Number(current.user.id)] },
  ]);
  const messages = await query("SELECT id, role, content, model, created_at FROM reading_messages WHERE session_id = $1 ORDER BY id ASC", [reading.id]);
  return success({ reading: normalizeReading({ ...reading, updated_at: new Date().toISOString() }, messages), answer: content.answer, model: settings.model, usage: content.usage, usage_id: inserted[0]?.id || null });
}

export async function closeReading(request, id) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const rows = await query("UPDATE reading_sessions SET status = 'closed', updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *", [id, Number(current.user.id)]);
  if (!rows[0]) throw new AppError("ไม่พบชุดไพ่ของคุณ", 404, "READING_NOT_FOUND");
  return success({ reading: normalizeReading(rows[0]) });
}

export async function tarotChat(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const data = await parseJson(request);
  const question = stringValue(data.question, "คำถาม ", 2_000);
  const cards = await cardMetadata(data.cards);
  const settings = await getOpenAiSettings();
  await enforceAiRateLimit(current.user.id);
  const conversation = Array.isArray(data.conversation) ? data.conversation : [];
  const content = await createTarotResponse({ userId: current.user.id, question, cards, messages: conversation, settings, dailyLimit: current.user.daily_ai_limit });
  return success({ answer: content.answer, cards, model: settings.model, usage: content.usage });
}

async function ownedReading(id, userId) {
  const rows = await query("SELECT * FROM reading_sessions WHERE id = $1 AND user_id = $2 LIMIT 1", [String(id), Number(userId)]);
  return assertReadingOwner(rows[0], userId);
}

export { buildTarotInput, composeTarotInstructions, validateReadingCards as validCardFiles };
