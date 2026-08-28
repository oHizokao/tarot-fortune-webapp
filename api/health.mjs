import { endpoint, requireMethod, success } from "../lib/vercel/http.mjs";
import { isDatabaseConfigured } from "../lib/vercel/db.mjs";

export const GET = endpoint(async (request) => {
  requireMethod(request, "GET");
  return success({
    runtime: "vercel-node",
    database_configured: isDatabaseConfigured(),
    openai_env_configured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
  });
});
