import { AppError, query } from "./db.mjs";
import { readCookies, sessionCookie, clearSessionCookie, withSetCookie } from "./http.mjs";
import { newCsrfToken, signSession, verifyAccessCode, verifyPassword, verifySession } from "./security.mjs";

export const SESSION_COOKIE = "tarot_session";

export function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidUsername(value) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(String(value ?? "").trim());
}

export function isCustomerUser(user) {
  return user?.role === "member" || user?.role === "beta_user";
}

export function isReaderLoginAllowed(user) {
  return Boolean(user && (user.role === "admin" || isCustomerUser(user)));
}

export function sessionMatchesUser(session, user) {
  return Boolean(
    session
    && user
    && Number(session.userId) === Number(user.id)
    && Number(session.sessionVersion) === Number(user.session_version || 0)
    && Number(user.session_version || 0) >= 1,
  );
}

export async function findUserById(id) {
  const rows = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [Number(id)]);
  return rows[0] || null;
}

export async function findAdminByEmail(email) {
  const rows = await query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = 'admin' LIMIT 1", [String(email).trim()]);
  return rows[0] || null;
}

export async function findUserByLogin(identifier) {
  const value = String(identifier ?? "").trim().toLowerCase();
  const rows = await query(
    "SELECT * FROM users WHERE LOWER(username) = $1 OR (email IS NOT NULL AND LOWER(email) = $1) LIMIT 1",
    [value],
  );
  return rows[0] || null;
}

export async function findBetaByAccessCode(code) {
  const rows = await query("SELECT * FROM users WHERE role = 'beta_user' AND access_code_hash IS NOT NULL ORDER BY id DESC", []);
  for (const user of rows) {
    if (await verifyAccessCode(code, user.access_code_hash)) return user;
  }
  return null;
}

export async function refreshUserStatus(user) {
  if (user?.status === "active" && user.access_expires_at && new Date(user.access_expires_at).getTime() <= Date.now() && user.role !== "admin") {
    await query("UPDATE users SET status = 'expired', session_version = session_version + 1, updated_at = NOW() WHERE id = $1 AND status = 'active'", [Number(user.id)]);
    return { ...user, status: "expired", session_version: Number(user.session_version || 1) + 1 };
  }
  return user;
}

export function canUseAi(user) {
  if (!user || user.status !== "active") return false;
  if (user.must_change_password) return false;
  if (user.role === "admin") return true;
  if (user.access_mode !== "beta_unlimited") return false;
  return Boolean(user.access_expires_at && new Date(user.access_expires_at).getTime() > Date.now());
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    username: String(user.username || ""),
    name: String(user.name || ""),
    email: String(user.email || ""),
    role: String(user.role || ""),
    status: String(user.status || ""),
    access_mode: String(user.access_mode || ""),
    access_started_at: user.access_started_at,
    access_expires_at: user.access_expires_at,
    credits: Number(user.credits || 0),
    daily_ai_limit: Math.max(0, Number(user.daily_ai_limit ?? 20)),
    must_change_password: Boolean(user.must_change_password),
    ai_usage_today: Number(user.ai_usage_today || 0),
    ai_enabled: canUseAi(user),
  };
}

export async function currentSession(request) {
  const token = readCookies(request)[SESSION_COOKIE];
  const session = verifySession(token);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  const refreshed = await refreshUserStatus(user);
  if (!sessionMatchesUser(session, refreshed)) return null;
  return { session, user: refreshed };
}

export async function requireBetaUser(request) {
  const current = await currentSession(request);
  if (!current) throw new AppError("กรุณาเข้าสู่ระบบก่อนใช้ AI Tarot Reader", 401, "ACCOUNT_AUTH_REQUIRED");
  if (current.user.status !== "active") {
    if (current.user.status === "pending") throw new AppError("บัญชีรอการอนุมัติจากผู้ดูแลก่อนใช้ AI", 403, "ACCOUNT_PENDING");
    const expired = current.user.status === "expired";
    throw new AppError(expired ? "สิทธิ์ AI หมดอายุแล้ว" : "บัญชีนี้ถูกระงับชั่วคราว", 403, expired ? "BETA_ACCESS_EXPIRED" : "BETA_ACCESS_SUSPENDED");
  }
  if (current.user.must_change_password) throw new AppError("กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน AI", 403, "PASSWORD_CHANGE_REQUIRED");
  if (!canUseAi(current.user)) {
    throw new AppError("บัญชีนี้ยังไม่ได้รับสิทธิ์ AI Tarot Reader", 403, "AI_ACCESS_REQUIRED");
  }
  return current;
}

export async function requireAdmin(request) {
  const current = await currentSession(request);
  if (!current || current.user.role !== "admin" || current.user.status !== "active") {
    throw new AppError("กรุณาเข้าสู่ระบบแอดมิน", 401, "ADMIN_AUTH_REQUIRED");
  }
  return current;
}

export function requireCsrf(request, session) {
  const provided = request.headers.get("x-csrf-token") || "";
  if (!provided || provided !== session.csrf) {
    throw new AppError("คำขอไม่ผ่านการตรวจสอบความปลอดภัย", 419, "CSRF_FAILED");
  }
}

export function startSessionResponse(response, user) {
  const csrf = newCsrfToken();
  const token = signSession({ userId: user.id, role: user.role, csrf, sessionVersion: user.session_version });
  const result = withSetCookie(response, sessionCookie(token));
  return { response: result, csrf };
}

export function clearSessionResponse(response) {
  return withSetCookie(response, clearSessionCookie());
}

export async function verifyAdminPassword(password, user) {
  if (!user?.password_hash) return false;
  return verifyPassword(password, user.password_hash);
}
