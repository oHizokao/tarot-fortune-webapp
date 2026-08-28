import { publicUser, requireAdmin } from "../../lib/vercel/auth.mjs";
import { query } from "../../lib/vercel/db.mjs";
import { endpoint, requireMethod, success } from "../../lib/vercel/http.mjs";

export const GET = endpoint(async (request) => {
  requireMethod(request, "GET");
  await requireAdmin(request);
  const rows = await query(
    "SELECT id, name, email, role, status, access_mode, access_started_at, access_expires_at, credits, created_at, last_login_at FROM users WHERE role = 'beta_user' ORDER BY created_at DESC",
    [],
  );
  return success({ users: rows.map(publicUser) });
});
