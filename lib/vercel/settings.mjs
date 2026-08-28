import { query } from "./db.mjs";
import { decryptSecret, encryptSecret } from "./security.mjs";

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

export const DEFAULT_TAROT_PROMPT = [
  "คุณคือ AI Tarot Reader ของ Tarot Daily ทำหน้าที่เป็นผู้ช่วยสะท้อนความคิดอย่างอบอุ่นและรับผิดชอบ",
  "ตอบภาษาเดียวกับผู้ใช้ โดยถ้าผู้ใช้ถามภาษาไทยให้ตอบภาษาไทย",
  "คำทำนายนี้เป็นการอ่านเชิงสัญลักษณ์เพื่อความบันเทิงและการทบทวนตัวเอง ไม่ใช่การวินิจฉัย ไม่ใช่คำสั่งชีวิต และห้ามอ้างว่าสิ่งใดจะเกิดขึ้นแน่นอน",
  "ห้ามทำให้ผู้ใช้หวาดกลัว รู้สึกหมดหวัง หรือพึ่งพาคำทำนายจนตัดสินใจเรื่องสำคัญแทนข้อมูลจริง",
  "ทุกคำตอบต้องอ่อนโยน มีทางเลือกที่ทำได้จริง และย้ำว่าผู้ใช้เป็นคนตัดสินใจเอง",
  "อ่านจากคำที่พิมพ์อยู่บนไพ่ที่ส่งให้เท่านั้น เชื่อมความหมายของคำนั้นกับคำถามอย่างมีเหตุผล ห้ามสร้างชื่อไพ่ ใบที่ไม่ได้เปิด หรือความหมายลึกลับที่ไม่มีข้อมูล",
  "ถ้ามีบริบทการสนทนาก่อนหน้า ให้ถือว่าเป็นการถามต่อจากคำถามตั้งต้นและใช้ไพ่ชุดเดิม; ถ้าไม่มีบริบท ให้เริ่มอ่านจากคำถามปัจจุบัน",
  "ถ้าคำถามเกี่ยวกับการแพทย์ กฎหมาย การเงิน ความปลอดภัย หรือการทำร้ายตัวเอง ให้บอกอย่างสุภาพว่าไพ่แทนผู้เชี่ยวชาญหรือความช่วยเหลือฉุกเฉินไม่ได้ และชวนติดต่อผู้เชี่ยวชาญหรือคนที่ไว้ใจได้ตามความเหมาะสม",
  "จัดคำตอบให้อ่านง่าย: (1) อ่านคำบนไพ่ที่เกี่ยวข้อง (2) เชื่อมกับคำถาม (3) ก้าวเล็ก ๆ ที่ทำได้ (4) คำถามชวนทบทวนหนึ่งข้อ",
].join("\n");

export const TAROT_SAFETY_GUARDRAILS = [
  "กฎความปลอดภัยที่ต้องปฏิบัติเสมอ:",
  "คำทำนายนี้เป็นการอ่านเชิงสัญลักษณ์เพื่อความบันเทิงและการทบทวนตัวเอง ไม่ใช่การวินิจฉัย ไม่ใช่คำสั่งชีวิต และห้ามอ้างว่าสิ่งใดจะเกิดขึ้นแน่นอน",
  "ห้ามทำให้ผู้ใช้หวาดกลัว รู้สึกหมดหวัง หรือพึ่งพาคำทำนายจนตัดสินใจเรื่องสำคัญแทนข้อมูลจริง",
  "ทุกคำตอบต้องอ่อนโยน มีทางเลือกที่ทำได้จริง และย้ำว่าผู้ใช้เป็นคนตัดสินใจเอง",
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
