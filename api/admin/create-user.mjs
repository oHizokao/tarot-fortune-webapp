import { AppError, query } from "../../lib/vercel/db.mjs";
import { publicUser, requireAdmin, requireCsrf } from "../../lib/vercel/auth.mjs";
import { endpoint, assertSameOrigin, parseJson, requireMethod, stringValue, success } from "../../lib/vercel/http.mjs";
import { expiryFromDuration, accessHint, newAccessCode } from "../../lib/vercel/access.mjs";
import { hashAccessCode } from "../../lib/vercel/security.mjs";

export const POST = endpoint(async (request) => {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireAdmin(request);
  const data = await parseJson(request);
  requireCsrf(request, current.session);
  const name = stringValue(data.name, "ชื่อ ", 120);
  const email = stringValue(data.email, "อีเมล ", 190).toLowerCase();
  const duration = String(data.duration || "24h");
  const accessCode = newAccessCode();
  try {
    const rows = await query(
      "INSERT INTO users (name, email, access_code_hash, access_code_hint, role, status, access_mode, access_started_at, access_expires_at, credits, created_at, updated_at) VALUES ($1, $2, $3, $4, 'beta_user', 'active', 'beta_unlimited', NOW(), $5, 0, NOW(), NOW()) RETURNING *",
      [name, email, await hashAccessCode(accessCode), accessHint(accessCode), expiryFromDuration(duration)],
    );
    return success({ user: publicUser(rows[0]), access_code: accessCode });
  } catch (error) {
    if (error?.code === "23505") {
      throw new AppError("อีเมลนี้มีผู้ใช้อยู่แล้ว", 409, "EMAIL_ALREADY_EXISTS");
    }
    throw error;
  }
});
