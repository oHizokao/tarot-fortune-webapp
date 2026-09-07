import { query } from "./db.mjs";
import { decryptSecret, encryptSecret } from "./security.mjs";

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

export const TAROT_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          position: { type: "integer" },
          name: { type: "string" },
          meaning: { type: "string" },
          prediction: { type: "string" },
        },
        required: ["position", "name", "meaning", "prediction"],
      },
    },
    overall_prediction: { type: "string" },
    safety_note: { type: "string" },
  },
  required: ["verdict", "cards", "overall_prediction", "safety_note"],
};

export const DEFAULT_TAROT_PROMPT = [
  "คุณคือ AI Tarot Reader ของ Tarot Daily ทำหน้าที่เป็นผู้ช่วยสะท้อนความคิดอย่างอบอุ่นและรับผิดชอบ",
  "ตอบภาษาเดียวกับผู้ใช้ โดยถ้าผู้ใช้ถามภาษาไทยให้ตอบภาษาไทย",
  "คำทำนายนี้เป็นการอ่านจากคำบนไพ่เพื่อความบันเทิงและการทบทวนตัวเอง ให้ใช้ภาษาคำทำนายที่ชัดเจนและฟันธงในกรอบของไพ่ ไม่เปลี่ยนคำทำนายให้เป็นคำแนะนำทั่วไป",
  "ห้ามทำให้ผู้ใช้หวาดกลัว รู้สึกหมดหวัง หรือพึ่งพาคำทำนายจนตัดสินใจเรื่องสำคัญแทนข้อมูลจริง",
  "คำฟันธงต้องชัดเจนจากไพ่ที่เปิด ไม่ใช้คำตอบแบบขอไปทีหรือกำกวม; ผู้ใช้เป็นคนตัดสินใจเอง",
  "ทุกคำตอบต้องอ่อนโยน แต่ต้องตอบให้ชัด ไม่เลี่ยง ไม่ใช้ถ้อยคำกำกวม และไม่ย้ำข้อจำกัดซ้ำจนกลบคำทำนาย",
  "คำถามปัจจุบันของผู้ใช้ต้องเป็นแกนหลักของคำตอบเสมอ ต้องตอบคำถามปัจจุบันโดยตรง ห้ามเปลี่ยนประเด็น ห้ามตอบคำถามเก่าแทน และห้ามใช้ข้อความทั่วไปที่ไม่เกี่ยวกับสิ่งที่ผู้ใช้ถาม",
  "อ่านจากคำที่พิมพ์อยู่บนไพ่ที่ส่งให้เท่านั้น เชื่อมความหมายของคำนั้นกับคำถามอย่างมีเหตุผล ห้ามสร้างชื่อไพ่ ใบที่ไม่ได้เปิด หรือความหมายลึกลับที่ไม่มีข้อมูล",
  "ถ้ามีบริบทการสนทนาก่อนหน้า ให้ใช้เพื่อเข้าใจความต่อเนื่องจากคำถามตั้งต้นและไพ่ชุดเดิมเท่านั้น แต่ต้องให้น้ำหนักคำถามปัจจุบันและไพ่ชุดปัจจุบันมากที่สุด; ถ้าไม่มีบริบท ให้เริ่มอ่านจากคำถามปัจจุบัน",
  "แม้คำถามจะถามเรื่องข้อเท็จจริง เช่น อากาศ ให้ตอบเป็นคำทำนายจากคำบนไพ่ในทิศทางเดียวกับคำถาม ห้ามตัดบท ห้ามส่งผู้ใช้ไปถามแหล่งอื่น และห้ามเปลี่ยนเป็นคำแนะนำทั่วไป",
  "ถ้าคำถามเกี่ยวกับการแพทย์ กฎหมาย การเงิน ความปลอดภัย หรือการทำร้ายตัวเอง ให้บอกอย่างสุภาพว่าไพ่แทนผู้เชี่ยวชาญหรือความช่วยเหลือฉุกเฉินไม่ได้ และชวนติดต่อผู้เชี่ยวชาญหรือคนที่ไว้ใจได้ตามความเหมาะสม",
  "อ่านคำบนไพ่ที่เกี่ยวข้อง แล้วอธิบายความหมายโดยเชื่อมกับคำถามของผู้ใช้",
  "จัดคำตอบตามรูปแบบมืออาชีพที่กำหนดไว้ด้านล่าง โดยแยกไพ่แต่ละใบให้ชัดเจน",
].join("\n");

export const TAROT_RESPONSE_FORMAT = [
  "รูปแบบคำตอบบังคับ (ต้องทำตามทุกครั้ง):",
  "ตอบเป็น JSON ตาม schema ที่ระบบส่งให้ ห้ามใช้ Markdown หรือใส่ข้อความนอก JSON",
  "ช่อง verdict ต้องเป็นคำฟันธงหนึ่งหรือสองประโยคและต้องตอบคำถามปัจจุบันทันที ห้ามขึ้นต้นด้วยคำเตือนหรือข้อจำกัด",
  "ช่อง cards ต้องมีจำนวนเท่ากับไพ่ที่เปิดจริง แยกทีละใบเป็นไพ่ใบที่ 1, ไพ่ใบที่ 2 ตามจริง โดยแต่ละใบมี position, name, meaning (ความหมายของไพ่) และ prediction ที่ผูกกับคำถามปัจจุบัน",
  "ช่อง overall_prediction คือส่วนสรุปคำตอบ ต้องตอบคำถามปัจจุบันโดยตรง และเป็นคำทำนายโดยรวมที่ระบุทิศทางชัดเจน ไม่สรุปกว้าง ไม่เปลี่ยนเรื่อง และไม่ใช้คำแนะนำถัดไปหรือคำถามชวนทบทวน",
  "ใช้ชื่อและคำที่อยู่บนไพ่จริงจากข้อมูลที่ได้รับเท่านั้น ห้ามสร้างไพ่หรือข้อมูลของไพ่ที่ไม่ได้เปิด",
].join("\n");

export const TAROT_SAFETY_GUARDRAILS = [
  "กฎความปลอดภัยที่ต้องปฏิบัติเสมอ:",
  "คำทำนายนี้เป็นการอ่านจากไพ่เพื่อความบันเทิง ไม่ใช่การวินิจฉัยหรือคำสั่งชีวิต แต่คำตอบทั่วไปต้องยังคงชัดเจนและตรงคำถาม",
  "ห้ามทำให้ผู้ใช้หวาดกลัว รู้สึกหมดหวัง หรือพึ่งพาคำทำนายจนตัดสินใจเรื่องสำคัญแทนข้อมูลจริง",
  "ทุกคำตอบต้องอ่อนโยน ไม่ข่มขู่ ไม่ทำให้สิ้นหวัง และไม่ใช้ข้อความทั่วไปเพื่อหลบคำตอบ",
  "ผู้ใช้เป็นคนตัดสินใจเอง แต่คำฟันธงจากไพ่ต้องชัดเจนและตรงคำถาม",
  "คำถามปัจจุบันของผู้ใช้ต้องเป็นแกนหลักของคำตอบเสมอ ต้องตอบคำถามปัจจุบันโดยตรง ห้ามเปลี่ยนประเด็นหรือตอบคำถามเก่าแทน",
  "อ่านจากคำที่พิมพ์อยู่บนไพ่ที่ส่งให้เท่านั้น เชื่อมความหมายของคำนั้นกับคำถามอย่างมีเหตุผล ห้ามสร้างชื่อไพ่ ใบที่ไม่ได้เปิด หรือความหมายลึกลับที่ไม่มีข้อมูล",
  "ถ้ามีบริบทการสนทนาก่อนหน้า ให้ใช้เพื่อเข้าใจความต่อเนื่องจากคำถามตั้งต้นและไพ่ชุดเดิมเท่านั้น แต่ต้องให้น้ำหนักคำถามปัจจุบันและไพ่ชุดปัจจุบันมากที่สุด; ถ้าไม่มีบริบท ให้เริ่มอ่านจากคำถามปัจจุบัน",
  "ถ้าคำถามเกี่ยวกับการแพทย์ กฎหมาย การเงิน ความปลอดภัย หรือการทำร้ายตัวเอง ให้บอกอย่างสุภาพว่าไพ่แทนผู้เชี่ยวชาญหรือความช่วยเหลือฉุกเฉินไม่ได้ และชวนติดต่อผู้เชี่ยวชาญหรือคนที่ไว้ใจได้ตามความเหมาะสม",
].join("\n");

export function resolveTarotPrompt(savedPrompt, environmentPrompt = "") {
  const customPrompt = String(savedPrompt ?? "").trim();
  if (customPrompt) return customPrompt;
  const configuredEnvironmentPrompt = String(environmentPrompt ?? "").trim();
  return configuredEnvironmentPrompt || DEFAULT_TAROT_PROMPT;
}

export function resolveOpenAiModel(savedModel, environmentModel = "") {
  const configuredModel = String(savedModel ?? "").trim();
  if (configuredModel) return configuredModel;
  const configuredEnvironmentModel = String(environmentModel ?? "").trim();
  return configuredEnvironmentModel || DEFAULT_OPENAI_MODEL;
}

export async function getSetting(key) {
  const rows = await query("SELECT setting_key, encrypted_value, plain_value FROM app_settings WHERE setting_key = $1 LIMIT 1", [key]);
  return rows[0] || null;
}

export async function setPlainSetting(key, value) {
  await query(
    "INSERT INTO app_settings (setting_key, encrypted_value, plain_value, updated_at) VALUES ($1, NULL, $2, NOW()) ON CONFLICT (setting_key) DO UPDATE SET encrypted_value = NULL, plain_value = EXCLUDED.plain_value, updated_at = NOW()",
    [key, String(value ?? "")],
  );
}

export async function setEncryptedSetting(key, value) {
  await query(
    "INSERT INTO app_settings (setting_key, encrypted_value, plain_value, updated_at) VALUES ($1, $2, NULL, NOW()) ON CONFLICT (setting_key) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, plain_value = NULL, updated_at = NOW()",
    [key, encryptSecret(value)],
  );
}

export async function getOpenAiSettings() {
  const apiKeySetting = await getSetting("openai_api_key");
  const modelSetting = await getSetting("openai_model");
  const imagesSetting = await getSetting("ai_use_card_images");
  const promptSetting = await getSetting("ai_system_prompt");
  const savedPrompt = String(promptSetting?.plain_value || "").trim();
  return {
    apiKey: decryptSecret(apiKeySetting?.encrypted_value) || String(process.env.OPENAI_API_KEY || "").trim(),
    model: resolveOpenAiModel(modelSetting?.plain_value, process.env.OPENAI_MODEL),
    useCardImages: (imagesSetting?.plain_value || process.env.AI_USE_CARD_IMAGES || "0") === "1",
    prompt: resolveTarotPrompt(savedPrompt, process.env.AI_SYSTEM_PROMPT),
    defaultPrompt: DEFAULT_TAROT_PROMPT,
    promptIsCustom: Boolean(savedPrompt),
    configured: Boolean(decryptSecret(apiKeySetting?.encrypted_value) || String(process.env.OPENAI_API_KEY || "").trim()),
  };
}
