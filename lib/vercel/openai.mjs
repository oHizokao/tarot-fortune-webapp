import { AppError, query as defaultQuery } from "./db.mjs";
import { DEFAULT_TAROT_PROMPT, TAROT_SAFETY_GUARDRAILS } from "./settings.mjs";
import { hashText } from "./security.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

export function buildOpenAiBody({ model, instructions, input, userId, maxOutputTokens = 900 }) {
  return {
    model: String(model),
    reasoning: { effort: "low" },
    instructions: String(instructions || ""),
    input: String(input || ""),
    max_output_tokens: Math.max(20, Math.min(900, Number(maxOutputTokens) || 900)),
    store: false,
    safety_identifier: hashText(`tarot-user:${Number(userId)}`),
  };
}

export function composeTarotInstructions(prompt) {
  return [String(prompt || "").trim() || DEFAULT_TAROT_PROMPT, TAROT_SAFETY_GUARDRAILS].join("\n\n");
}

export function buildTarotInput(question, metadata, conversation = []) {
  const cardLines = metadata.map((card, index) => {
    const keywords = Array.isArray(card.keywords) ? card.keywords.join(", ") : "";
    return `${index + 1}) ${card.file} — คำบนไพ่: ${card.name || ""} — คีย์เวิร์ด: ${keywords}`;
  });
  const messages = Array.isArray(conversation) ? conversation.filter((message) => message && typeof message === "object") : [];
  const recentConversation = messages.slice(-4);
  const originalConversation = messages.length > recentConversation.length ? messages.slice(0, 2) : [];
  const selectedConversation = messages.length > recentConversation.length ? [...originalConversation, ...recentConversation] : recentConversation;
  const previous = selectedConversation.map((message) => {
    const role = message.role === "assistant" ? "ASSISTANT" : "USER";
    const content = String(message.content || "").trim().slice(0, 1200);
    return content ? `${role}: ${content}` : "";
  }).filter(Boolean);
  let input = `คำถามของผู้ใช้:\n${String(question).trim()}\n\nไพ่ที่เปิดจริง:\n${cardLines.join("\n")}`;
  if (previous.length) input += `\n\nบริบทการสนทนาก่อนหน้า:\n${previous.join("\n")}`;
  return input;
}

export async function requestOpenAi({ settings, input, userId, maxOutputTokens = 900, fetchImpl = globalThis.fetch, timeoutMs = 25_000 }) {
  if (!settings?.apiKey) throw new AppError("AI ยังไม่ได้ตั้งค่า API key ในระบบ", 503, "OPENAI_NOT_CONFIGURED");
  if (!settings?.model) throw new AppError("AI ยังไม่ได้ตั้งค่า model ในระบบ", 503, "OPENAI_NOT_CONFIGURED");
  if (typeof fetchImpl !== "function") throw new AppError("ระบบเชื่อมต่อ AI ไม่พร้อมใช้งาน", 503, "AI_UPSTREAM_ERROR");

  const body = buildOpenAiBody({ model: settings.model, instructions: composeTarotInstructions(settings.prompt), input, userId, maxOutputTokens });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(OPENAI_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${settings.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) throw new AppError("AI ใช้เวลานานกว่าปกติ กรุณาลองใหม่อีกครั้ง", 504, "AI_TIMEOUT");
      throw new AppError("เชื่อมต่อ AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 502, "AI_UPSTREAM_ERROR");
    } finally {
      clearTimeout(timeout);
    }

    let decoded = {};
    try { decoded = await response.json(); } catch { decoded = {}; }
    if (response.ok) {
      const answer = extractResponseText(decoded);
      if (!answer) throw new AppError("AI ไม่ได้ส่งคำตอบกลับมา ลองถามอีกครั้ง", 502, "EMPTY_AI_RESPONSE");
      return { answer: answer.slice(0, 12_000), responseId: String(decoded.id || ""), usage: normalizeUsage(decoded.usage) };
    }

    if (TRANSIENT_STATUSES.has(response.status) && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError("API key ของ OpenAI ใช้งานไม่ได้หรือไม่มีสิทธิ์เข้าถึงโมเดล กรุณาตรวจสอบคีย์และ Project", 502, "OPENAI_AUTH_FAILED");
    }
    if (response.status === 400 || response.status === 404) {
      throw new AppError("model ที่ตั้งค่าไว้ไม่พร้อมใช้งาน กรุณาตรวจสอบในหน้า Admin", 502, "MODEL_UNAVAILABLE");
    }
    if (response.status === 429) {
      throw new AppError("โควตาหรือเครดิตของ OpenAI ยังไม่พร้อม กรุณาตรวจ Billing/Usage แล้วลองใหม่", 429, "AI_RATE_LIMITED");
    }
    throw new AppError("AI ยังไม่พร้อมตอบคำถามนี้ กรุณาลองใหม่อีกครั้ง", 502, "AI_UPSTREAM_ERROR");
  }
  throw new AppError("AI ยังไม่พร้อมตอบคำถามนี้ กรุณาลองใหม่อีกครั้ง", 502, "AI_UPSTREAM_ERROR");
}

export async function createTarotResponse({ userId, question, cards, messages = [], settings, dailyLimit, queryFn = defaultQuery, fetchImpl = globalThis.fetch }) {
  if (!settings?.apiKey || !settings?.model) throw new AppError("AI ยังไม่ได้ตั้งค่า API key และ model ในระบบ", 503, "OPENAI_NOT_CONFIGURED");
  const limit = Number.isFinite(Number(dailyLimit)) ? Math.max(0, Number(dailyLimit)) : await userDailyLimit(queryFn, userId);
  const count = await successfulCountToday(queryFn, userId);
  if (count >= limit) throw new AppError("วันนี้ใช้สิทธิ์ถาม AI ครบแล้ว กรุณาลองใหม่พรุ่งนี้หรือติดต่อผู้ดูแล", 429, "DAILY_LIMIT_REACHED");

  const input = buildTarotInput(question, cards, messages);
  try {
    return await requestOpenAi({ settings, input, userId, fetchImpl });
  } catch (error) {
    await recordAiFailure(queryFn, { userId, question, cards, model: settings.model, errorType: error?.code || "AI_UPSTREAM_ERROR" });
    throw error;
  }
}

export async function testOpenAiConnection(settings, { fetchImpl = globalThis.fetch } = {}) {
  const started = Date.now();
  try {
    const result = await requestOpenAi({ settings, input: "ตอบเพียงคำว่า OK", userId: "admin-connection-test", maxOutputTokens: 20, fetchImpl, timeoutMs: 10_000 });
    return { ok: true, model: settings.model, latency_ms: Date.now() - started, response_id: result.responseId || null };
  } catch (error) {
    return { ok: false, model: settings?.model || "", latency_ms: Date.now() - started, code: error?.code || "AI_UPSTREAM_ERROR" };
  }
}

export async function successfulCountToday(queryFn, userId) {
  const rows = await queryFn(
    "SELECT COUNT(*)::int AS count FROM ai_usage WHERE user_id = $1 AND request_status = 'success' AND created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')",
    [Number(userId)],
  );
  return Number(rows[0]?.count || 0);
}

async function userDailyLimit(queryFn, userId) {
  const rows = await queryFn("SELECT daily_ai_limit FROM users WHERE id = $1 LIMIT 1", [Number(userId)]);
  return Math.max(0, Number(rows[0]?.daily_ai_limit ?? 20));
}

async function recordAiFailure(queryFn, { userId, question, cards, model, errorType }) {
  try {
    await queryFn(
      "INSERT INTO ai_usage (user_id, question_hash, question_text, answer_text, card_ids, model, request_status, error_type, created_at) VALUES ($1, $2, NULL, NULL, $3::jsonb, $4, 'failed', $5, NOW())",
      [Number(userId), hashText(question), JSON.stringify(cards.map((card) => card.file)), String(errorType).slice(0, 120),],
    );
  } catch {
    // Preserve the upstream error if the audit table is unavailable during an interrupted deployment.
  }
}

function normalizeUsage(usage = {}) {
  return {
    input_tokens: Number(usage.input_tokens || usage.input_tokens_details?.total_tokens || 0),
    output_tokens: Number(usage.output_tokens || usage.output_tokens_details?.total_tokens || 0),
  };
}

export function extractResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}
