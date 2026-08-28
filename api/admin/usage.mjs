import { query } from "../../lib/vercel/db.mjs";
import { requireAdmin } from "../../lib/vercel/auth.mjs";
import { endpoint, requireMethod, success } from "../../lib/vercel/http.mjs";

export const GET = endpoint(async (request) => {
  requireMethod(request, "GET");
  await requireAdmin(request);
  const rows = await query(
    "SELECT COUNT(*) AS total_requests, COUNT(*) FILTER (WHERE request_status = 'success') AS successful_requests, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens FROM ai_usage WHERE created_at >= NOW() - INTERVAL '24 hours'",
    [],
  );
  const users = await query("SELECT COUNT(*) AS active_beta_users FROM users WHERE role = 'beta_user' AND status = 'active' AND access_expires_at > NOW()", []);
  return success({ stats: { ...rows[0], active_beta_users: users[0]?.active_beta_users || 0 } });
});
