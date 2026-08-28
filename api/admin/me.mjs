import { publicUser, requireAdmin } from "../../lib/vercel/auth.mjs";
import { endpoint, requireMethod, success } from "../../lib/vercel/http.mjs";

export const GET = endpoint(async (request) => {
  requireMethod(request, "GET");
  const current = await requireAdmin(request);
  return success({ user: publicUser(current.user), csrf_token: current.session.csrf });
});
