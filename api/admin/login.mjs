import { AppError, query } from "../../lib/vercel/db.mjs";
import { findAdminByEmail, publicUser } from "../../lib/vercel/auth.mjs";
import { endpoint, assertSameOrigin, parseJson, requireMethod, stringValue, success, withSetCookie } from "../../lib/vercel/http.mjs";
import { enforceLoginRateLimit } from "../../lib/vercel/rate-limit.mjs";
import { newCsrfToken, signSession, verifyPassword } from "../../lib/vercel/security.mjs";

export const POST = endpoint(async (request) => {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const data = await parseJson(request);
  const email = stringValue(data.email, "อีเมล ", 190).toLowerCase();
  const password = stringValue(data.password, "รหัสผ่าน ", 200);
  enforceLoginRateLimit("admin:" + (request.headers.get("x-forwarded-for") || "unknown"));
  const user = await findAdminByEmail(email);
  if (!user || user.status !== "active" || !(await verifyPassword(password, String(user.password_hash || "")))) {
    throw new AppError("อีเมลหรือรหัสผ่านไม่ถูกต้อง", 401, "ADMIN_LOGIN_FAILED");
  }
  await query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1", [Number(user.id)]);
  const csrf = newCsrfToken();
  const response = success({ user: publicUser(user), csrf_token: csrf });
  return withSetCookie(response, signedCookie(user, csrf));
});

function signedCookie(user, csrf) {
  return "tarot_session=" + encodeURIComponent(signSession({ userId: user.id, role: user.role, csrf })) + "; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
}
