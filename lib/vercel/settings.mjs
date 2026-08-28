import { query } from "./db.mjs";
import { decryptSecret, encryptSecret } from "./security.mjs";

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
  return {
    apiKey: decryptSecret(apiKeySetting?.encrypted_value) || String(process.env.OPENAI_API_KEY || "").trim(),
    model: String(modelSetting?.plain_value || process.env.OPENAI_MODEL || "").trim(),
    useCardImages: (imagesSetting?.plain_value || process.env.AI_USE_CARD_IMAGES || "0") === "1",
    configured: Boolean(decryptSecret(apiKeySetting?.encrypted_value) || String(process.env.OPENAI_API_KEY || "").trim()),
  };
}
