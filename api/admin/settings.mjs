import { query } from "../../lib/vercel/db.mjs";
import { getOpenAiSettings, setEncryptedSetting, setPlainSetting } from "../../lib/vercel/settings.mjs";
import { requireAdmin, requireCsrf } from "../../lib/vercel/auth.mjs";
import { endpoint, assertSameOrigin, parseJson, requireMethod, success } from "../../lib/vercel/http.mjs";

const handleSettings = endpoint(async (request) => {
  requireMethod(request, ["GET", "POST"]);
  const current = await requireAdmin(request);
  if (request.method === "GET") {
    const settings = await getOpenAiSettings();
    return success({ configured: settings.configured, model: settings.model, use_card_images: settings.useCardImages });
  }

  assertSameOrigin(request);
  const data = await parseJson(request);
  requireCsrf(request, current.session);
  const apiKey = String(data.openai_api_key || "").trim();
  const model = String(data.openai_model || "").trim();
  if (apiKey) await setEncryptedSetting("openai_api_key", apiKey);
  if (model) await setPlainSetting("openai_model", model);
  await setPlainSetting("ai_use_card_images", data.use_card_images ? "1" : "0");
  const settings = await getOpenAiSettings();
  return success({ configured: settings.configured, model: settings.model, use_card_images: settings.useCardImages });
});

export const GET = handleSettings;
export const POST = handleSettings;
