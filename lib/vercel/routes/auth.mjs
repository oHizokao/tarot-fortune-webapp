import { AppError, isDatabaseConfigured, query } from "../db.mjs";
import { currentSession, findBetaByAccessCode, findUserByLogin, isCustomerUser, isReaderLoginAllowed, isValidUsername, normalizeUsername, publicUser, refreshUserStatus } from "../auth.mjs";
import { addClearCookie, assertSameOrigin, parseJson, requireMethod, stringValue, success, withSetCookie } from "../http.mjs";
import { enforceLoginRateLimit } from "../rate-limit.mjs";
import { hashPassword, newCsrfToken, signSession, verifyPassword } from "../security.mjs";

export async function betaLogin(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const data = await parseJson(request);
  const accessCode = stringValue(data.access_code, "Beta Access Code ", 120);
  await enforceLoginRateLimit("beta:" + clientAddress(request));

  const found = await findBetaByAccessCode(accessCode);
  const user = found ? await refreshUserStatus(found) : null;
  if (!user || user.status !== "active" || user.role !== "beta_user" || user.access_mode !== "beta_unlimited" || !user.access_expires_at || new Date(user.access_expires_at).getTime() <= Date.now()) {
    throw new AppError("รหัส Beta ไม่ถูกต้องหรือหมดอายุแล้ว", 401, "BETA_LOGIN_FAILED");
  }

  const csrf = newCsrfToken();
  const response = success({ user: publicUser(user), csrf_token: csrf });
  return withSetCookie(response, signSessionCookie(user, csrf));
}

export async function register(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const data = await parseJson(request);
  const username = normalizeUsername(stringValue(data.username, "ชื่อผู้ใช้ ", 32));
  if (!isValidUsername(username)) {
    throw new AppError("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9 และ _ ความยาว 3–32 ตัวอักษร", 422, "INVALID_USERNAME");
  }
  const name = stringValue(data.name, "ชื่อ ", 120);
  const email = optionalEmail(data.email);
  const password = passwordValue(data.password);
  if (password.length < 8) throw new AppError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร", 422, "INVALID_PASSWORD");
  await enforceLoginRateLimit("register:" + username + ":" + clientAddress(request));

  try {
    const rows = await query(
      "INSERT INTO users (username, name, email, password_hash, role, status, access_mode, credits, created_at, updated_at) VALUES ($1, $2, $3, $4, 'member', 'pending', 'member', 0, NOW(), NOW()) RETURNING *",
      [username, name, email, await hashPassword(password)],
    );
    return success({ registered: true, requires_approval: true, user: publicUser(rows[0]) }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505") throw new AppError("ชื่อผู้ใช้หรืออีเมลนี้มีผู้ใช้แล้ว", 409, "IDENTITY_ALREADY_EXISTS");
    throw error;
  }
}

export async function login(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const data = await parseJson(request);
  const identifier = stringValue(data.username || data.email, "ชื่อผู้ใช้ ", 190);
  const password = passwordValue(data.password);
  await enforceLoginRateLimit("account:" + identifier.toLowerCase() + ":" + clientAddress(request));
  const found = await findUserByLogin(identifier);
  const user = found ? await refreshUserStatus(found) : null;
  if (!user || !(await verifyPassword(password, String(user.password_hash || "")))) {
    throw new AppError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401, "LOGIN_FAILED");
  }
  if (!isReaderLoginAllowed(user)) {
    throw new AppError("บัญชีนี้ยังไม่เปิดให้เข้าใช้งานห้องอ่านไพ่", 403, "READER_ACCESS_REQUIRED");
  }
  if (user.status === "pending") throw new AppError("สมัครสมาชิกสำเร็จแล้ว กรุณารอผู้ดูแลอนุมัติก่อนเข้าใช้งาน", 403, "ACCOUNT_PENDING");
  if (user.status !== "active") throw new AppError("บัญชีนี้ถูกระงับหรือหมดอายุแล้ว", 403, "ACCOUNT_UNAVAILABLE");
  await query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1", [Number(user.id)]);
  const csrf = newCsrfToken();
  return withSetCookie(success({ user: publicUser(user), csrf_token: csrf }), signSessionCookie(user, csrf));
}

export async function logout(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  return addClearCookie(success({ logged_out: true }));
}

export async function changePassword(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await currentSession(request);
  if (!current || !isReaderLoginAllowed(current.user)) throw new AppError("กรุณาเข้าใช้งานก่อนเปลี่ยนรหัสผ่าน", 401, "ACCOUNT_AUTH_REQUIRED");
  if (current.user.status !== "active") throw new AppError("บัญชีนี้ยังไม่พร้อมใช้งาน", 403, "ACCOUNT_UNAVAILABLE");
  if ((request.headers.get("x-csrf-token") || "") !== current.session.csrf) throw new AppError("คำขอไม่ผ่านการตรวจสอบความปลอดภัย", 419, "CSRF_FAILED");

  const data = await parseJson(request);
  const currentPassword = passwordValue(data.current_password);
  const newPassword = passwordValue(data.new_password);
  if (newPassword.length < 8) throw new AppError("รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร", 422, "INVALID_PASSWORD");
  if (!(await verifyPassword(currentPassword, String(current.user.password_hash || "")))) throw new AppError("รหัสผ่านเดิมไม่ถูกต้อง", 403, "CURRENT_PASSWORD_INVALID");
  if (currentPassword === newPassword) throw new AppError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม", 422, "PASSWORD_NOT_CHANGED");

  const rows = await query(
    "UPDATE users SET password_hash = $2, must_change_password = FALSE, session_version = session_version + 1, last_password_changed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *",
    [Number(current.user.id), await hashPassword(newPassword)],
  );
  const user = rows[0];
  const csrf = newCsrfToken();
  return withSetCookie(success({ changed: true, user: publicUser(user), csrf_token: csrf }), signSessionCookie(user, csrf));
}

export async function me(request) {
  requireMethod(request, "GET");
  if (!isDatabaseConfigured()) {
    return success({ authenticated: false, backend_configured: false, user: null, csrf_token: null });
  }
  const current = await currentSession(request);
  const user = current?.user || null;
  return success({
    backend_configured: true,
    authenticated: Boolean(user && user.status === "active"),
    user: user ? publicUser(user) : null,
    csrf_token: user?.status === "active" ? current.session.csrf : null,
  });
}

function passwordValue(value) {
  const password = String(value ?? "");
  if (!password || password.length > 200) throw new AppError("รหัสผ่านไม่ครบหรือยาวเกินกำหนด", 422, "INVALID_PASSWORD");
  return password;
}

function optionalEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("อีเมลไม่ถูกต้อง", 422, "INVALID_EMAIL");
  }
  return email;
}

function signSessionCookie(user, csrf) {
  return "tarot_session=" + encodeURIComponent(signSession({ userId: user.id, role: user.role, csrf, sessionVersion: user.session_version })) + "; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
}

function clientAddress(request) {
  return String(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim().slice(0, 120);
}
