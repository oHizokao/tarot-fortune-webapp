import { AppError } from "../../lib/vercel/db.mjs";
import { findBetaByAccessCode, publicUser, refreshUserStatus } from "../../lib/vercel/auth.mjs";
import { endpoint, assertSameOrigin, parseJson, requireMethod, stringValue, success, withSetCookie } from "../../lib/vercel/http.mjs";
import { enforceLoginRateLimit } from "../../lib/vercel/rate-limit.mjs";
import { newCsrfToken, signSession } from "../../lib/vercel/security.mjs";

export const POST = endpoint(async (request) => {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const data = await parseJson(request);
  const accessCode = stringValue(data.access_code, "Beta Access Code ", 120);
  enforceLoginRateLimit("beta:" + (request.headers.get("x-forwarded-for") || "unknown"));

  const found = await findBetaByAccessCode(accessCode);
  const user = found ? await refreshUserStatus(found) : null;
  if (!user || user.status !== "active" || user.role !== "beta_user" || user.access_mode !== "beta_unlimited" || !user.access_expires_at || new Date(user.access_expires_at).getTime() <= Date.now()) {
    throw new AppError("รหัส Beta ไม่ถูกต้องหรือหมดอายุแล้ว", 401, "BETA_LOGIN_FAILED");
  }

  const csrf = newCsrfToken();
  const response = success({ user: publicUser(user), csrf_token: csrf });
  return withSetCookie(response, signSessionCookie(user, csrf));
});

function signSessionCookie(user, csrf) {
  return "tarot_session=" + encodeURIComponent(signSession({ userId: user.id, role: user.role, csrf })) + "; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
}
