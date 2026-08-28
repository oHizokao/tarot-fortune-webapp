import { AppError, query } from "../../lib/vercel/db.mjs";
import { publicUser } from "../../lib/vercel/auth.mjs";
import { endpoint, assertSameOrigin, parseJson, requireMethod, success, stringValue, withSetCookie } from "../../lib/vercel/http.mjs";
import { hashPassword, newCsrfToken, signSession } from "../../lib/vercel/security.mjs";

export const POST = endpoint(async (request) => {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const expectedSecret = String(process.env.TAROT_BOOTSTRAP_SECRET || "");
  if (!expectedSecret) throw new AppError("ยังไม่ได้ตั้งค่า TAROT_BOOTSTRAP_SECRET ใน Vercel", 503, "SERVER_CONFIG_MISSING");

  const data = await parseJson(request);
  if (String(data.setup_secret || "") !== expectedSecret) {
    throw new AppError("Setup secret ไม่ถูกต้อง", 403, "BOOTSTRAP_DENIED");
  }
  const name = stringValue(data.name, "ชื่อ ", 120);
  const email = stringValue(data.email, "อีเมล ", 190).toLowerCase();
  const password = stringValue(data.password, "รหัสผ่าน ", 200);
  if (password.length < 10) throw new AppError("รหัสผ่านแอดมินต้องยาวอย่างน้อย 10 ตัวอักษร", 422, "INVALID_PASSWORD");

  const countRows = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'", []);
  if (Number(countRows[0]?.count || 0) > 0) {
    throw new AppError("มี Admin อยู่แล้ว ไม่สามารถ bootstrap ซ้ำได้", 409, "ADMIN_ALREADY_EXISTS");
  }

  const passwordHash = await hashPassword(password);
  const rows = await query(
    "INSERT INTO users (name, email, password_hash, role, status, access_mode, credits, created_at, updated_at) VALUES ($1, $2, $3, 'admin', 'active', 'admin', 0, NOW(), NOW()) RETURNING *",
    [name, email, passwordHash],
  );
  const user = rows[0];
  const csrf = newCsrfToken();
  const response = success({ user: publicUser(user), csrf_token: csrf });
  return withSetCookie(response, signedCookie(user, csrf));
});

function signedCookie(user, csrf) {
  return "tarot_session=" + encodeURIComponent(signSession({ userId: user.id, role: user.role, csrf })) + "; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
}
