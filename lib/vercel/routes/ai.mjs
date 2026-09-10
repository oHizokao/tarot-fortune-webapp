import { AppError, query, transaction } from "../db.mjs";
import { requireBetaUser, requireCsrf } from "../auth.mjs";
import { assertSameOrigin, parseJson, requireMethod, stringValue, success } from "../http.mjs";
import { enforceAiRateLimit } from "../rate-limit.mjs";
import { getOpenAiSettings } from "../settings.mjs";
import { hashText } from "../security.mjs";
import { buildTarotInput, composeTarotInstructions, createTarotResponse } from "../openai.mjs";
import { allocateDeckSlice, assertReadingOwner, cardMetadata, createDeckOrder, createReadingId, normalizeDeckSession, normalizeReading, normalizeRound, readingContext, validateReadingCards, validateSelectedIndexes } from "../readings.mjs";

const READING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECK_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;

export function normalizePreviousReadingId(value) {
  const id = String(value ?? "").trim();
  if (!id) return "";
  if (!READING_ID_PATTERN.test(id)) throw new AppError("ชุดไพ่เดิมไม่ถูกต้อง", 422, "INVALID_READING_ID");
  return id;
}

export async function createReading(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const data = await parseJson(request);
  const cards = validateReadingCards(data.cards);
  const previousReadingId = normalizePreviousReadingId(data.previous_reading_id);
  let previousReading = null;
  let previousMessages = [];
  if (previousReadingId) {
    previousReading = await ownedReading(previousReadingId, current.user.id);
    if (previousReading.status !== "active") throw new AppError("ชุดไพ่เดิมปิดแล้ว กรุณาเริ่มเรื่องใหม่", 409, "READING_CLOSED");
    previousMessages = await query("SELECT role, content, model, response_id, input_tokens, output_tokens, created_at FROM reading_messages WHERE session_id = $1 ORDER BY id ASC", [previousReading.id]);
  }
  const readingId = createReadingId();
  const statements = [{
    text: "INSERT INTO reading_sessions (id, user_id, cards, title, status, created_at, updated_at) VALUES ($1, $2, $3::jsonb, $4, 'active', NOW(), NOW()) RETURNING *",
    params: [readingId, Number(current.user.id), JSON.stringify(cards), String(data.title || "คำถามใหม่").trim().slice(0, 160) || "คำถามใหม่"],
  }];
  if (previousReading) {
    statements.push(...previousMessages.filter(isCopyableMessage).map((message) => ({
      text: "INSERT INTO reading_messages (session_id, role, content, model, response_id, input_tokens, output_tokens, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      params: [readingId, message.role, String(message.content).trim(), message.model || null, message.response_id || null, nonNegativeInteger(message.input_tokens), nonNegativeInteger(message.output_tokens), message.created_at || new Date().toISOString()],
    })));
    statements.push({
      text: "UPDATE reading_sessions SET status = 'closed', updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'active'",
      params: [previousReading.id, Number(current.user.id)],
    });
  }
  const [rows] = await transaction(statements);
  return success({ reading: normalizeReading(rows[0], previousMessages) }, { status: 201 });
}

export async function createDeckSession(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const data = await parseJson(request);
  const title = String(data.title || "คำถามใหม่").trim().slice(0, 160) || "คำถามใหม่";
  const sessionId = createReadingId();
  const deckOrder = createDeckOrder();
  const [, inserted] = await transaction([
    { text: "UPDATE reading_sessions SET status = 'closed', updated_at = NOW() WHERE user_id = $1 AND status = 'active'", params: [Number(current.user.id)] },
    { text: "INSERT INTO reading_sessions (id, user_id, cards, deck_order, draw_cursor, opened_count, title, status, created_at, updated_at) VALUES ($1, $2, '[]'::jsonb, $3::jsonb, 0, 0, $4, 'active', NOW(), NOW()) RETURNING *", params: [sessionId, Number(current.user.id), JSON.stringify(deckOrder), title] },
  ]);
  return success({ session: normalizeDeckSession(inserted[0], []), remaining: deckOrder.length, rounds: [] }, { status: 201 });
}

export async function listDeckSessions(request) {
  requireMethod(request, "GET");
  const current = await requireBetaUser(request);
  const rows = await query(`
    SELECT s.*,
      (
        SELECT r.question
        FROM reading_rounds r
        WHERE r.session_id = s.id
        ORDER BY r.round_number DESC
        LIMIT 1
      ) AS latest_question
    FROM reading_sessions s
    WHERE s.user_id = $1
    ORDER BY CASE WHEN s.status = 'active' THEN 0 ELSE 1 END, s.updated_at DESC
    LIMIT 20
  `, [Number(current.user.id)]);
  return success({ sessions: rows.map((row) => ({ ...normalizeDeckSession(row), latest_question: String(row.latest_question || "") })) });
}

export async function getDeckSession(request, id) {
  requireMethod(request, "GET");
  const current = await requireBetaUser(request);
  const session = await ownedDeckSession(id, current.user.id);
  return success({ session: await deckSessionPayload(session) });
}

export async function drawReadingRound(request, id) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const data = await parseJson(request);
  const count = normalizeDrawCount(data.count);
  const question = stringValue(data.question, "คำถาม ", 2_000);
  const requestId = normalizeDeckRequestId(data.request_id);
  const selectedIndexes = data.selected_indexes == null ? null : validateSelectedIndexes(data.selected_indexes, count);
  const sessionId = normalizeReadingId(id);
  const roundId = createReadingId();
  let roundRows;
  try {
    [roundRows] = await transaction([{
      text: `WITH locked AS (
        SELECT * FROM reading_sessions
        WHERE id = $1 AND user_id = $2
        FOR UPDATE
      ), existing AS (
        SELECT r.id FROM reading_rounds r
        WHERE r.session_id = $1 AND r.request_id = $4
        LIMIT 1
      ), occupied_visual AS (
        SELECT DISTINCT slot.value::INTEGER AS slot_index
        FROM reading_rounds r
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(r.selected_indexes, '[]'::jsonb)) AS slot(value)
        WHERE r.session_id = $1
      ), picked AS (
        SELECT l.id AS session_id,
          l.draw_cursor,
          COALESCE((SELECT MAX(r.round_number) FROM reading_rounds r WHERE r.session_id = l.id), 0) + 1 AS round_number,
          jsonb_agg(to_jsonb(deck.card) ORDER BY deck.ordinal) AS selected_cards
        FROM locked l
        CROSS JOIN LATERAL jsonb_array_elements_text(l.deck_order) WITH ORDINALITY AS deck(card, ordinal)
        WHERE l.status = 'active'
          AND jsonb_array_length(l.deck_order) = 78
          AND l.draw_cursor >= 0
          AND l.draw_cursor + $3 <= jsonb_array_length(l.deck_order)
          AND deck.ordinal > l.draw_cursor
          AND deck.ordinal <= l.draw_cursor + $3
          AND NOT EXISTS (SELECT 1 FROM existing)
          AND ($7::jsonb IS NULL OR NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text($7::jsonb) AS wanted(value)
            JOIN occupied_visual used ON used.slot_index = wanted.value::INTEGER
          ))
        GROUP BY l.id, l.draw_cursor
      ), advanced AS (
        UPDATE reading_sessions s
        SET draw_cursor = s.draw_cursor + $3,
            opened_count = s.opened_count + $3,
            updated_at = NOW()
        FROM picked p
        WHERE s.id = p.session_id
        RETURNING s.id
      )
      INSERT INTO reading_rounds (id, session_id, round_number, question, cards, selected_indexes, status, request_id, created_at, updated_at)
      SELECT $5, p.session_id, p.round_number, $6, p.selected_cards, $7::jsonb, 'drawn', $4, NOW(), NOW()
      FROM picked p
      JOIN advanced a ON a.id = p.session_id
      RETURNING *`,
      params: [sessionId, Number(current.user.id), count, requestId, roundId, question, selectedIndexes == null ? null : JSON.stringify(selectedIndexes)],
    }]);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    roundRows = await query("SELECT * FROM reading_rounds WHERE session_id = $1 AND request_id = $2 LIMIT 1", [sessionId, requestId]);
  }

  // A replay with the same logical request can legitimately return no INSERT
  // row because the locked CTE already found it. Resolve that row before
  // checking visual-slot conflicts, otherwise a safe retry is misreported as
  // SELECTED_SLOT_USED.
  const round = roundRows?.[0] || (await query("SELECT * FROM reading_rounds WHERE session_id = $1 AND request_id = $2 LIMIT 1", [sessionId, requestId]))[0];
  let session = await ownedDeckSession(sessionId, current.user.id);
  if (round) {
    const storedRound = normalizeRound(round);
    const storedIndexes = storedRound.selected_indexes;
    const payloadChanged = storedRound.cards.length !== count
      || storedRound.question.trim() !== question.trim()
      || (selectedIndexes && storedIndexes && JSON.stringify(storedIndexes) !== JSON.stringify(selectedIndexes));
    if (payloadChanged) {
      throw new AppError("รหัสคำขอนี้ถูกใช้กับตำแหน่งไพ่อื่นแล้ว", 409, "REQUEST_PAYLOAD_MISMATCH");
    }
  }
  if (!round) {
    if (session.status !== "active") throw new AppError("สำรับนี้ถูกล้างแล้ว กรุณาเริ่มสำรับใหม่", 409, "DECK_SESSION_CLOSED");
    if (selectedIndexes) {
      const conflicts = await query(`
        SELECT 1
        FROM reading_rounds r
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(r.selected_indexes, '[]'::jsonb)) AS slot(value)
        WHERE r.session_id = $1 AND slot.value::INTEGER = ANY($2::INTEGER[])
        LIMIT 1
      `, [sessionId, selectedIndexes]);
      if (conflicts[0]) throw new AppError("ตำแหน่งไพ่ถูกเปิดไปแล้ว กรุณาเลือกใบที่ยังไม่เปิด", 409, "SELECTED_SLOT_USED");
    }
    const remaining = deckRemaining(session);
    if (remaining < count) throw new AppError("ไพ่ไม่พอในสำรับสำหรับจำนวนที่เลือก", 409, "DECK_EXHAUSTED");
    throw new AppError("สำรับไพ่ยังไม่พร้อม กรุณาเริ่มสำรับใหม่", 409, "DECK_NOT_READY");
  }
  return success({ session: await deckSessionPayload(session), round: normalizeRound(round), remaining: deckRemaining(session), idempotent: round.id !== roundId });
}

export async function answerReadingRound(request, sessionId, roundId) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const session = await ownedDeckSession(normalizeReadingId(sessionId), current.user.id);
  const round = await ownedRound(roundId, session.id);
  const normalizedRound = normalizeRound(round);
  const metadata = await cardMetadata(normalizedRound.cards);
  if (normalizedRound.answer && normalizedRound.answer_text) {
    return success({ session: await deckSessionPayload(session), round: normalizedRound, answer: normalizedRound.answer_text, structured: normalizedRound.answer, cards: metadata, model: normalizedRound.answer?.model || "" });
  }
  if (normalizedRound.status !== "drawn") throw new AppError("รอบไพ่นี้ไม่พร้อมรับคำตอบ", 409, "ROUND_NOT_READY");
  const previousRounds = await query("SELECT question, answer_text FROM reading_rounds WHERE session_id = $1 AND round_number < $2 AND status = 'answered' ORDER BY round_number DESC LIMIT 4", [session.id, normalizedRound.round_number]);
  const conversation = previousRounds.reverse().flatMap((item) => [
    { role: "user", content: String(item.question || "") },
    { role: "assistant", content: String(item.answer_text || "") },
  ]);
  const settings = await getOpenAiSettings();
  await enforceAiRateLimit(current.user.id);
  const content = await createTarotResponse({ userId: current.user.id, question: normalizedRound.question, cards: metadata, messages: conversation, settings, dailyLimit: current.user.daily_ai_limit });
  const logContent = String(process.env.LOG_AI_CONTENT || "0") === "1";
  const [updatedRows, usageRows] = await transaction([
    { text: "UPDATE reading_rounds SET answer_json = $2::jsonb, answer_text = $3, status = 'answered', updated_at = NOW() WHERE id = $1 AND session_id = $4 AND status = 'drawn' RETURNING *", params: [normalizedRound.id, JSON.stringify(content.structured), content.answer, session.id] },
    { text: "INSERT INTO ai_usage (user_id, question_hash, question_text, answer_text, card_ids, model, response_id, request_status, input_tokens, output_tokens, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'success', $8, $9, NOW()) RETURNING id", params: [Number(current.user.id), hashText(normalizedRound.question), logContent ? normalizedRound.question : null, logContent ? content.answer : null, JSON.stringify(normalizedRound.cards), settings.model, content.responseId || null, content.usage.input_tokens, content.usage.output_tokens] },
    { text: "INSERT INTO reading_messages (session_id, round_id, role, content, model, response_id, input_tokens, output_tokens, created_at) VALUES ($1, $2, 'user', $3, $4, NULL, 0, 0, NOW()), ($1, $2, 'assistant', $5, $4, $6, $7, $8, NOW())", params: [session.id, normalizedRound.id, normalizedRound.question, settings.model, content.answer, content.responseId || null, content.usage.input_tokens, content.usage.output_tokens] },
    { text: "UPDATE reading_sessions SET updated_at = NOW() WHERE id = $1 AND user_id = $2", params: [session.id, Number(current.user.id)] },
    { text: "UPDATE users SET last_ai_used_at = NOW(), updated_at = NOW() WHERE id = $1", params: [Number(current.user.id)] },
  ]);
  const updated = updatedRows[0] || { ...round, answer_json: content.structured, answer_text: content.answer, status: "answered" };
  const freshSession = await ownedDeckSession(session.id, current.user.id);
  return success({ session: await deckSessionPayload(freshSession), round: normalizeRound(updated), answer: content.answer, structured: content.structured, cards: metadata, model: settings.model, usage: content.usage, usage_id: usageRows[0]?.id || null });
}

export async function resetDeckSession(request, id) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const sessionId = normalizeReadingId(id);
  const rows = await query("UPDATE reading_sessions SET status = 'closed', updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *", [sessionId, Number(current.user.id)]);
  if (!rows[0]) throw new AppError("ไม่พบสำรับไพ่ของคุณ", 404, "READING_NOT_FOUND");
  return success({ session: await deckSessionPayload(rows[0]), remaining: 0 });
}

export async function deleteDeckSession(request, id) {
  requireMethod(request, "DELETE");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const sessionId = normalizeReadingId(id);
  const rows = await query("DELETE FROM reading_sessions WHERE id = $1 AND user_id = $2 RETURNING id", [sessionId, Number(current.user.id)]);
  if (!rows[0]) throw new AppError("ไม่พบประวัติการดูดวงของคุณ", 404, "READING_NOT_FOUND");
  return success({ deleted: 1, session_id: String(rows[0].id) });
}

export async function deleteAllDeckSessions(request) {
  requireMethod(request, "DELETE");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  requireCsrf(request, current.session);
  const rows = await query("DELETE FROM reading_sessions WHERE user_id = $1 RETURNING id", [Number(current.user.id)]);
  return success({ deleted: rows.length });
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
  const cards = await cardMetadata(readingContext(reading).cards);
  return success({ reading: normalizeReading(reading, messages), cards });
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
  return success({ reading: normalizeReading({ ...reading, updated_at: new Date().toISOString() }, messages), answer: content.answer, cards: metadata, model: settings.model, usage: content.usage, usage_id: inserted[0]?.id || null });
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

async function ownedDeckSession(id, userId) {
  const rows = await query("SELECT * FROM reading_sessions WHERE id = $1 AND user_id = $2 LIMIT 1", [normalizeReadingId(id), Number(userId)]);
  return assertReadingOwner(rows[0], userId);
}

async function ownedRound(id, sessionId) {
  const rows = await query("SELECT * FROM reading_rounds WHERE id = $1 AND session_id = $2 LIMIT 1", [normalizeReadingId(id), String(sessionId)]);
  if (!rows[0]) throw new AppError("ไม่พบรอบไพ่ของคุณ", 404, "ROUND_NOT_FOUND");
  return rows[0];
}

async function deckSessionPayload(session) {
  const rows = await query("SELECT * FROM reading_rounds WHERE session_id = $1 ORDER BY round_number ASC", [String(session.id)]);
  return normalizeDeckSession(session, rows);
}

function normalizeReadingId(value) {
  const id = String(value ?? "").trim();
  if (!READING_ID_PATTERN.test(id)) throw new AppError("รหัสสำรับไพ่ไม่ถูกต้อง", 422, "INVALID_READING_ID");
  return id;
}

function normalizeDrawCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new AppError("เลือกไพ่ได้ครั้งละ 1–3 ใบ", 422, "INVALID_DRAW_COUNT");
  return count;
}

function normalizeDeckRequestId(value) {
  const id = String(value ?? "").trim() || createReadingId();
  if (!DECK_REQUEST_ID_PATTERN.test(id)) throw new AppError("รหัสคำขอเปิดไพ่ไม่ถูกต้อง", 422, "INVALID_REQUEST_ID");
  return id;
}

function deckRemaining(session) {
  const deckLength = Array.isArray(session?.deck_order) ? session.deck_order.length : parseJsonArray(session?.deck_order).length;
  return Math.max(0, (deckLength || 78) - Number(session?.draw_cursor || 0));
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isUniqueViolation(error) {
  return String(error?.code || "") === "23505";
}

function isCopyableMessage(message) {
  return Boolean(message && ["user", "assistant"].includes(message.role) && String(message.content || "").trim());
}

function nonNegativeInteger(value) {
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

export { buildTarotInput, composeTarotInstructions, validateReadingCards as validCardFiles };
