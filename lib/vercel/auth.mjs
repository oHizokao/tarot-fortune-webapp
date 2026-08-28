import { AppError, query } from "./db.mjs";
import { readCookies, sessionCookie, clearSessionCookie, withSetCookie } from "./http.mjs";
import { newCsrfToken, signSession, verifyAccessCode, verifyPassword, verifySession } from "./security.mjs";

export const SESSION_COOKIE = "tarot_session";

export async function findUserById(id) {
  const rows = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [Number(id)]);
  return rows[0] || null;
}

export async function findAdminByEmail(email) {
  const rows = await query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = 'admin' LIMIT 1", [String(email).trim()]);
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
  if (user?.role === "beta_user" && user.status === "active" && user.access_expires_at && new Date(user.access_expires_at).getTime() <= Date.now()) {
    await query("UPDATE users SET status = 'expired', updated_at = NOW() WHERE id = $1 AND status = 'active'", [Number(user.id)]);
    return { ...user, status: "expired" };
  }
  return user;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    name: String(user.name || ""),
    email: String(user.email || ""),
    role: String(user.role || ""),
    status: String(user.status || ""),
    access_mode: String(user.access_mode || ""),
    access_started_at: user.access_started_at,
    access_expires_at: user.access_expires_at,
    credits: Number(user.credits || 0),
  };
}

export async function currentSession(request) {
  const token = readCookies(request)[SESSION_COOKIE];
  const session = verifySession(token);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { session, user: await refreshUserStatus(user) };
}

export async function requireBetaUser(request) {
  const current = await currentSession(request);
  if (!current || current.user.role !== "beta_user") {
    throw new AppError("กรุณาเข้าสู่ Beta Access ก่อน", 401, "BETA_AUTH_REQUIRED");
  }
  if (current.user.status !== "active") {
    const expired = current.user.status === "expired";
    throw new AppError(expired ? "Beta Access หมดอายุแล้ว" : "Beta Access นี้ถูกระงับ", 403, expired ? "BETA_ACCESS_EXPIRED" : "BETA_ACCESS_SUSPENDED");
  }
  if (current.user.access_mode !== "beta_unlimited" || !current.user.access_expires_at || new Date(current.user.access_expires_at).getTime() <= Date.now()) {
    throw new AppError("บัญชีนี้ไม่มีสิทธิ์ AI Beta ที่ใช้งานอยู่", 403, "BETA_ACCESS_EXPIRED");
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
  const token = signSession({ userId: user.id, role: user.role, csrf });
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
