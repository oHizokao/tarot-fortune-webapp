import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError, query } from "../../lib/vercel/db.mjs";
import { requireBetaUser } from "../../lib/vercel/auth.mjs";
import { endpoint, assertSameOrigin, parseJson, requireMethod, success } from "../../lib/vercel/http.mjs";
import { enforceAiRateLimit } from "../../lib/vercel/rate-limit.mjs";
import { getOpenAiSettings } from "../../lib/vercel/settings.mjs";
import { hashText } from "../../lib/vercel/security.mjs";

let cardsPromise;

export const POST = endpoint(async (request) => {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireBetaUser(request);
  const csrf = request.headers.get("x-csrf-token") || "";
  if (!csrf || csrf !== current.session.csrf) {
    throw new AppError("คำขอไม่ผ่านการตรวจสอบความปลอดภัย", 419, "CSRF_FAILED");
  }

  const data = await parseJson(request);
  const question = String(data.question || "").trim();
  if (!question || question.length > 2000) {
    throw new AppError("คำถามต้องมีความยาว 1–2,000 ตัวอักษร", 422, "INVALID_QUESTION");
  }
  const cardFiles = validCardFiles(data.cards);
  const metadata = await cardMetadata(cardFiles);
  await enforceAiRateLimit(current.user.id);

  const settings = await getOpenAiSettings();
  if (!settings.apiKey || !settings.model) {
    throw new AppError("AI ยังไม่ได้ตั้งค่า API key และ model ในหลังบ้าน", 503, "OPENAI_NOT_CONFIGURED");
  }

  const input = buildInput(question, metadata, data.conversation);
  const content = await callOpenAi(input, settings, current.user.id);
  const logContent = String(process.env.LOG_AI_CONTENT || "0") === "1";
  const inserted = await query(
    "INSERT INTO ai_usage (user_id, question_hash, question_text, answer_text, card_ids, model, response_id, request_status, input_tokens, output_tokens, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'success', $8, $9, NOW()) RETURNING id",
    [
      Number(current.user.id),
      hashText(question),
      logContent ? question : null,
      logContent ? content.answer : null,
      JSON.stringify(cardFiles),
      settings.model,
      content.responseId || null,
      Number(content.usage.input_tokens || 0),
      Number(content.usage.output_tokens || 0),
    ],
  );
  await query("UPDATE users SET last_ai_used_at = NOW(), updated_at = NOW() WHERE id = $1", [Number(current.user.id)]);

  return success({
    answer: content.answer,
    cards: metadata,
    model: settings.model,
    usage: {
      input_tokens: Number(content.usage.input_tokens || 0),
      output_tokens: Number(content.usage.output_tokens || 0),
    },
    usage_id: inserted[0]?.id || null,
  });
});

export function validCardFiles(cards) {
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 3) {
    throw new AppError("ต้องส่งไพ่ที่เปิด 1–3 ใบ", 422, "INVALID_CARDS");
  }
  const result = cards.map((value) => String(value || ""));
  if (result.some((file) => !/^card-(?:00[1-9]|0[1-6][0-9]|07[0-8])\.webp$/.test(file))) {
    throw new AppError("พบชื่อไฟล์ไพ่ที่ไม่อนุญาต", 422, "INVALID_CARD_FILE");
  }
  if (new Set(result).size !== result.length) {
    throw new AppError("ไพ่ในคำถามต้องไม่ซ้ำกัน", 422, "DUPLICATE_CARDS");
  }
  return result;
}

async function cardMetadata(cardFiles) {
  if (!cardsPromise) {
    cardsPromise = readFile(path.join(process.cwd(), "data", "cards.json"), "utf8").then((raw) => JSON.parse(raw));
  }
  const decoded = await cardsPromise;
  const byFile = new Map((decoded.cards || []).map((card) => [card.file, card]));
  return cardFiles.map((file) => {
    const card = byFile.get(file);
    if (!card) throw new AppError("ยังไม่มี metadata ของไพ่ที่เลือก", 503, "CARD_METADATA_MISSING");
    return card;
  });
}

export function buildInput(question, metadata, conversation) {
  const cardLines = metadata.map((card, index) => {
    const keywords = Array.isArray(card.keywords) ? card.keywords.join(", ") : "";
    return String(index + 1) + ") " + card.file + " — คำบนไพ่: " + (card.name || "") + " — คีย์เวิร์ด: " + keywords;
  });
  const previous = Array.isArray(conversation) ? conversation.slice(-4).map((message) => {
    const role = message?.role === "assistant" ? "ASSISTANT" : "USER";
    const content = String(message?.content || "").trim().slice(0, 1200);
    return content ? role + ": " + content : "";
  }).filter(Boolean) : [];
  let input = "คำถามของผู้ใช้:\n" + question + "\n\nไพ่ที่เปิดจริง:\n" + cardLines.join("\n");
  if (previous.length) input += "\n\nบริบทการสนทนาก่อนหน้า:\n" + previous.join("\n");
  return input;
}

const instructions = [
  "คุณคือ AI Tarot Reader ของ Tarot Daily ทำหน้าที่เป็นผู้ช่วยสะท้อนความคิดอย่างอบอุ่นและรับผิดชอบ",
  "ตอบภาษาเดียวกับผู้ใช้ โดยถ้าผู้ใช้ถามภาษาไทยให้ตอบภาษาไทย",
  "คำทำนายนี้เป็นการอ่านเชิงสัญลักษณ์เพื่อความบันเทิงและการทบทวนตัวเอง ไม่ใช่การวินิจฉัย ไม่ใช่คำสั่งชีวิต และห้ามอ้างว่าสิ่งใดจะเกิดขึ้นแน่นอน",
  "ห้ามทำให้ผู้ใช้หวาดกลัว รู้สึกหมดหวัง หรือพึ่งพาคำทำนายจนตัดสินใจเรื่องสำคัญแทนข้อมูลจริง",
  "ทุกคำตอบต้องอ่อนโยน มีทางเลือกที่ทำได้จริง และย้ำว่าผู้ใช้เป็นคนตัดสินใจเอง",
  "อ่านจากคำที่พิมพ์อยู่บนไพ่ที่ส่งให้เท่านั้น เชื่อมความหมายของคำนั้นกับคำถามอย่างมีเหตุผล ห้ามสร้างชื่อไพ่ ใบที่ไม่ได้เปิด หรือความหมายลึกลับที่ไม่มีข้อมูล",
  "ถ้าคำถามเกี่ยวกับการแพทย์ กฎหมาย การเงิน ความปลอดภัย หรือการทำร้ายตัวเอง ให้บอกอย่างสุภาพว่าไพ่แทนผู้เชี่ยวชาญหรือความช่วยเหลือฉุกเฉินไม่ได้ และชวนติดต่อผู้เชี่ยวชาญหรือคนที่ไว้ใจได้ตามความเหมาะสม",
  "จัดคำตอบให้อ่านง่าย: (1) อ่านคำบนไพ่ที่เกี่ยวข้อง (2) เชื่อมกับคำถาม (3) ก้าวเล็ก ๆ ที่ทำได้ (4) คำถามชวนทบทวนหนึ่งข้อ",
].join("\n");

async function callOpenAi(input, settings, userId) {
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer " + settings.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        instructions,
        input,
        max_output_tokens: 900,
        store: false,
        safety_identifier: hashText("tarot-user:" + userId),
      }),
    });
  } catch (error) {
    console.error("[tarot-ai] upstream connection failed", error?.message || error);
    throw new AppError("เชื่อมต่อ AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 502, "AI_UPSTREAM_ERROR");
  }

  let decoded = {};
  try {
    decoded = await response.json();
  } catch {
    throw new AppError("AI ส่งคำตอบที่อ่านไม่ได้", 502, "AI_UPSTREAM_ERROR");
  }
  if (!response.ok) {
    console.error("[tarot-ai] upstream status", response.status);
    throw new AppError("AI ยังไม่พร้อมตอบคำถามนี้ กรุณาลองใหม่อีกครั้ง", 502, "AI_UPSTREAM_ERROR");
  }
  const answer = extractResponseText(decoded);
  if (!answer) throw new AppError("AI ไม่ได้ส่งคำตอบกลับมา ลองถามอีกครั้ง", 502, "EMPTY_AI_RESPONSE");
  return {
    answer: answer.slice(0, 12000),
    responseId: String(decoded.id || ""),
    usage: decoded.usage || {},
  };
}

function extractResponseText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}
