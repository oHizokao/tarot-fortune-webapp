import { AppError, query } from "../db.mjs";
import { findUserByLogin, isValidUsername, normalizeUsername, publicUser, requireAdmin, requireCsrf } from "../auth.mjs";
import { accessHint, expiryFromDuration, newAccessCode } from "../access.mjs";
import { assertSameOrigin, addClearCookie, parseJson, requireMethod, stringValue, success, withSetCookie } from "../http.mjs";
import { DEFAULT_TAROT_PROMPT, getOpenAiSettings, setEncryptedSetting, setPlainSetting } from "../settings.mjs";
import { enforceLoginRateLimit } from "../rate-limit.mjs";
import { hashAccessCode, hashPassword, newCsrfToken, signSession, verifyPassword } from "../security.mjs";
import { adminReadiness } from "../readiness.mjs";

export async function diagnostics(request) {
  requireMethod(request, "GET");
  await requireAdmin(request);
  const checks = await adminReadiness({ query, getOpenAiSettings });
  return success({
    database: { ok: Boolean(checks.database?.ok) },
    schema: { ok: Boolean(checks.schema?.ok), version: Number(checks.schema?.version || 0) },
    admin: { ok: Boolean(checks.admin?.ok) },
    openai: { ok: Boolean(checks.openai?.ok), model: String(checks.openai?.model || "") },
  });
}

export async function bootstrap(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const expectedSecret = String(process.env.TAROT_BOOTSTRAP_SECRET || "");
  if (!expectedSecret) throw new AppError("ยังไม่ได้ตั้งค่า TAROT_BOOTSTRAP_SECRET ใน Vercel", 503, "SERVER_CONFIG_MISSING");

  const data = await parseJson(request);
  if (String(data.setup_secret || "") !== expectedSecret) {
    throw new AppError("Setup secret ไม่ถูกต้อง", 403, "BOOTSTRAP_DENIED");
  }
  const username = ownerUsername(data.username);
  const name = stringValue(data.name, "ชื่อ ", 120);
  const email = optionalEmail(data.email);
  const password = passwordValue(data.password);

  const countRows = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'", []);
  if (Number(countRows[0]?.count || 0) > 0) {
    throw new AppError("มี Admin อยู่แล้ว ไม่สามารถ bootstrap ซ้ำได้", 409, "ADMIN_ALREADY_EXISTS");
  }

  const passwordHash = await hashPassword(password);
  try {
    const rows = await query(
      "INSERT INTO users (username, name, email, password_hash, role, status, access_mode, credits, created_at, updated_at) VALUES ($1, $2, $3, $4, 'admin', 'active', 'admin', 0, NOW(), NOW()) RETURNING *",
      [username, name, email, passwordHash],
    );
    const user = rows[0];
    const csrf = newCsrfToken();
    return withSetCookie(success({ user: publicUser(user), csrf_token: csrf }), signSessionCookie(user, csrf));
  } catch (error) {
    if (error?.code === "23505") throw new AppError("ชื่อผู้ใช้หรืออีเมลนี้มีผู้ใช้แล้ว", 409, "IDENTITY_ALREADY_EXISTS");
    throw error;
  }
}

export async function createUser(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireAdmin(request);
  const data = await parseJson(request);
  requireCsrf(request, current.session);
  const username = optionalUsername(data.username) || generatedUsername();
  const name = stringValue(data.name, "ชื่อ ", 120);
  const email = optionalEmail(data.email);
  const duration = String(data.duration || "24h");
  const accessCode = newAccessCode();
  try {
    const rows = await query(
      "INSERT INTO users (username, name, email, access_code_hash, access_code_hint, role, status, access_mode, access_started_at, access_expires_at, credits, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 'beta_user', 'active', 'beta_unlimited', NOW(), $6, 0, NOW(), NOW()) RETURNING *",
      [username, name, email, await hashAccessCode(accessCode), accessHint(accessCode), expiryFromDuration(duration)],
    );
    return success({ user: publicUser(rows[0]), access_code: accessCode });
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
  enforceLoginRateLimit("admin:" + (request.headers.get("x-forwarded-for") || "unknown"));
  const user = await findUserByLogin(identifier);
  if (!user || user.role !== "admin" || user.status !== "active" || !(await verifyPassword(password, String(user.password_hash || "")))) {
    throw new AppError("ชื่อผู้ใช้หรือรหัสผ่านแอดมินไม่ถูกต้อง", 401, "ADMIN_LOGIN_FAILED");
  }
  await query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1", [Number(user.id)]);
  const csrf = newCsrfToken();
  return withSetCookie(success({ user: publicUser(user), csrf_token: csrf }), signSessionCookie(user, csrf));
}

export async function logout(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  return addClearCookie(success({ logged_out: true }));
}

export async function me(request) {
  requireMethod(request, "GET");
  const current = await requireAdmin(request);
  return success({ user: publicUser(current.user), csrf_token: current.session.csrf });
}

export async function settings(request) {
  requireMethod(request, ["GET", "POST"]);
  const current = await requireAdmin(request);
  if (request.method === "GET") {
    const values = await getOpenAiSettings();
    return success({ configured: values.configured, model: values.model, use_card_images: values.useCardImages, prompt: values.prompt, default_prompt: values.defaultPrompt || DEFAULT_TAROT_PROMPT, prompt_is_custom: values.promptIsCustom });
  }

  assertSameOrigin(request);
  const data = await parseJson(request);
  requireCsrf(request, current.session);
  const apiKey = String(data.openai_api_key || "").trim();
  const model = String(data.openai_model || "").trim();
  const hasModel = Object.prototype.hasOwnProperty.call(data, "openai_model");
  const hasPrompt = Object.prototype.hasOwnProperty.call(data, "ai_prompt");
  const prompt = String(data.ai_prompt ?? "").trim();
  if (hasPrompt && prompt.length > 12000) throw new AppError("Prompt ยาวเกิน 12,000 ตัวอักษร", 422, "PROMPT_TOO_LONG");
  if (apiKey) await setEncryptedSetting("openai_api_key", apiKey);
  if (hasModel) await setPlainSetting("openai_model", model);
  if (hasPrompt) await setPlainSetting("ai_system_prompt", prompt);
  await setPlainSetting("ai_use_card_images", data.use_card_images ? "1" : "0");
  const values = await getOpenAiSettings();
  return success({ configured: values.configured, model: values.model, use_card_images: values.useCardImages, prompt: values.prompt, default_prompt: values.defaultPrompt || DEFAULT_TAROT_PROMPT, prompt_is_custom: values.promptIsCustom });
}

export async function updateUser(request) {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireAdmin(request);
  const data = await parseJson(request);
  requireCsrf(request, current.session);
  const id = Number(data.id);
  const action = String(data.action || "");
  if (!Number.isInteger(id) || id < 1) throw new AppError("ผู้ใช้ไม่ถูกต้อง", 422, "INVALID_USER");
  const user = (await query("SELECT * FROM users WHERE id = $1 AND role <> 'admin' LIMIT 1", [id]))[0];
  if (!user) throw new AppError("ไม่พบผู้ใช้", 404, "USER_NOT_FOUND");

  if (action === "approve") {
    await query("UPDATE users SET status = 'active', access_mode = 'member', access_started_at = COALESCE(access_started_at, NOW()), access_expires_at = NULL, updated_at = NOW() WHERE id = $1", [id]);
  } else if (action === "grant_beta") {
    await query("UPDATE users SET status = 'active', access_mode = 'beta_unlimited', access_started_at = NOW(), access_expires_at = $2, updated_at = NOW() WHERE id = $1", [id, expiryFromDuration(data.duration || "24h")]);
  } else if (action === "suspend") {
    await query("UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = $1", [id]);
  } else if (action === "reactivate") {
    await query("UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1", [id]);
  } else if (action === "revoke") {
    await query("UPDATE users SET status = 'active', access_mode = 'member', access_expires_at = NULL, access_code_hash = NULL, access_code_hint = NULL, updated_at = NOW() WHERE id = $1", [id]);
  } else if (action === "extend") {
    await query("UPDATE users SET status = 'active', access_mode = 'beta_unlimited', access_started_at = COALESCE(access_started_at, NOW()), access_expires_at = $2, updated_at = NOW() WHERE id = $1", [id, expiryFromDuration(data.duration || "24h", Math.max(Date.now(), new Date(user.access_expires_at || 0).getTime()))]);
  } else if (action === "generate_code") {
    if (user.role !== "beta_user") throw new AppError("ผู้ใช้แบบสมาชิกไม่จำเป็นต้องใช้ Beta Code", 422, "INVALID_ACTION");
    const accessCode = newAccessCode();
    await query("UPDATE users SET access_code_hash = $2, access_code_hint = $3, status = 'active', access_mode = 'beta_unlimited', access_started_at = NOW(), access_expires_at = $4, updated_at = NOW() WHERE id = $1", [id, await hashAccessCode(accessCode), accessHint(accessCode), expiryFromDuration("24h")]);
    return success({ access_code: accessCode });
  } else if (action === "delete") {
    await query("DELETE FROM users WHERE id = $1 AND role <> 'admin'", [id]);
    return success({ deleted: true });
  } else {
    throw new AppError("คำสั่งจัดการผู้ใช้ไม่ถูกต้อง", 422, "INVALID_ACTION");
  }

  const updated = (await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]))[0];
  return success({ user: publicUser(updated) });
}

export async function usage(request) {
  requireMethod(request, "GET");
  await requireAdmin(request);
  const rows = await query(
    "SELECT COUNT(*) AS total_requests, COUNT(*) FILTER (WHERE request_status = 'success') AS successful_requests, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens FROM ai_usage WHERE created_at >= NOW() - INTERVAL '24 hours'",
    [],
  );
  const users = await query("SELECT COUNT(*) AS active_beta_users FROM users WHERE role <> 'admin' AND status = 'active' AND access_mode = 'beta_unlimited' AND access_expires_at > NOW()", []);
  return success({ stats: { ...rows[0], active_beta_users: users[0]?.active_beta_users || 0 } });
}

export async function users(request) {
  requireMethod(request, "GET");
  await requireAdmin(request);
  const rows = await query(
    "SELECT id, username, name, email, role, status, access_mode, access_started_at, access_expires_at, credits, created_at, last_login_at FROM users WHERE role <> 'admin' ORDER BY created_at DESC",
    [],
  );
  return success({ users: rows.map(publicUser) });
}

function ownerUsername(value) {
  const username = normalizeUsername(value || process.env.TAROT_OWNER_USERNAME || "oHizokao");
  if (!isValidUsername(username)) throw new AppError("ชื่อผู้ใช้ต้องเป็น a-z, 0-9 และ _ ความยาว 3–32 ตัวอักษร", 422, "INVALID_USERNAME");
  return username;
}

function optionalUsername(value) {
  if (!String(value ?? "").trim()) return "";
  const username = normalizeUsername(value);
  if (!isValidUsername(username)) throw new AppError("ชื่อผู้ใช้ต้องเป็น a-z, 0-9 และ _ ความยาว 3–32 ตัวอักษร", 422, "INVALID_USERNAME");
  return username;
}

function generatedUsername() {
  return "beta_" + Date.now().toString(36).slice(-20);
}

function optionalEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) return null;
  if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("อีเมลไม่ถูกต้อง", 422, "INVALID_EMAIL");
  }
  return email;
}

function passwordValue(value) {
  const password = String(value ?? "");
  if (password.length < 8 || password.length > 200) throw new AppError("รหัสผ่านต้องยาว 8–200 ตัวอักษร", 422, "INVALID_PASSWORD");
  return password;
}

function signSessionCookie(user, csrf) {
  return "tarot_session=" + encodeURIComponent(signSession({ userId: user.id, role: user.role, csrf })) + "; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
}
