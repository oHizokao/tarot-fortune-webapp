import { AppError, isDatabaseConfigured, query } from "../db.mjs";
import { currentSession, findBetaByAccessCode, publicUser, refreshUserStatus } from "../auth.mjs";
import { addClearCookie, assertSameOrigin, parseJson, requireMethod, stringValue, success, withSetCookie } from "../http.mjs";
import { enforceLoginRateLimit } from "../rate-limit.mjs";
import { newCsrfToken, signSession } from "../security.mjs";

export async function betaLogin(request) {
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
}

export async function logout(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  return addClearCookie(success({ logged_out: true }));
}

export async function me(request) {
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
}

function signSessionCookie(user, csrf) {
  return "tarot_session=" + encodeURIComponent(signSession({ userId: user.id, role: user.role, csrf })) + "; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
}
