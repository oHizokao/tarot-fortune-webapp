import { currentSession, publicUser } from "../../lib/vercel/auth.mjs";
import { isDatabaseConfigured } from "../../lib/vercel/db.mjs";
import { endpoint, requireMethod, success } from "../../lib/vercel/http.mjs";

export const GET = endpoint(async (request) => {
  requireMethod(request, "GET");
  if (!isDatabaseConfigured()) {
    return success({ authenticated: false, backend_configured: false, user: null, csrf_token: null });
  }
  const current = await currentSession(request);
  return success({
    backend_configured: true,
    authenticated: Boolean(current && current.user.role === "beta_user" && current.user.status === "active"),
    user: current && current.user.role === "beta_user" ? publicUser(current.user) : null,
    csrf_token: current && current.user.role === "beta_user" ? current.session.csrf : null,
  });
});
