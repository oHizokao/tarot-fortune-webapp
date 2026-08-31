import { endpoint, requireMethod, success } from "../lib/vercel/http.mjs";
import { isDatabaseConfigured, query } from "../lib/vercel/db.mjs";
import { getOpenAiSettings } from "../lib/vercel/settings.mjs";
import { adminReadiness, redactReadiness } from "../lib/vercel/readiness.mjs";

export const GET = endpoint(async (request) => {
  requireMethod(request, "GET");
  const checks = isDatabaseConfigured()
    ? await adminReadiness({ query, getOpenAiSettings })
    : { database: { ok: false }, schema: { ok: false }, admin: { ok: false }, openai: { ok: false, model: "" } };
  const readiness = redactReadiness(checks);
  return success({
    runtime: "vercel-node",
    ready: readiness.ready,
    database: readiness.database,
    schema: readiness.schema,
    admin: readiness.admin,
    ai: readiness.ai,
    database_configured: isDatabaseConfigured(),
    openai_env_configured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
  });
});
