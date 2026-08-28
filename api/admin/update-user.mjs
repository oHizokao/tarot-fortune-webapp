import { query } from "../../lib/vercel/db.mjs";
import { AppError } from "../../lib/vercel/db.mjs";
import { publicUser, requireAdmin, requireCsrf } from "../../lib/vercel/auth.mjs";
import { endpoint, assertSameOrigin, parseJson, requireMethod, success } from "../../lib/vercel/http.mjs";
import { accessHint, expiryFromDuration, newAccessCode } from "../../lib/vercel/access.mjs";
import { hashAccessCode } from "../../lib/vercel/security.mjs";

export const POST = endpoint(async (request) => {
  requireMethod(request, "POST");
  assertSameOrigin(request);
  const current = await requireAdmin(request);
  const data = await parseJson(request);
  requireCsrf(request, current.session);
  const id = Number(data.id);
  const action = String(data.action || "");
  if (!Number.isInteger(id) || id < 1) throw new AppError("ผู้ใช้ไม่ถูกต้อง", 422, "INVALID_USER");
  const userRows = await query("SELECT * FROM users WHERE id = $1 AND role = 'beta_user' LIMIT 1", [id]);
  const user = userRows[0];
  if (!user) throw new AppError("ไม่พบ Beta user", 404, "USER_NOT_FOUND");

  if (action === "suspend") {
    await query("UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = $1", [id]);
  } else if (action === "reactivate") {
    await query("UPDATE users SET status = 'active', access_mode = 'beta_unlimited', updated_at = NOW() WHERE id = $1", [id]);
  } else if (action === "revoke") {
    await query("UPDATE users SET status = 'expired', access_expires_at = NOW(), updated_at = NOW() WHERE id = $1", [id]);
  } else if (action === "extend") {
    await query("UPDATE users SET status = 'active', access_mode = 'beta_unlimited', access_expires_at = $2, updated_at = NOW() WHERE id = $1", [id, expiryFromDuration(data.duration || "24h", Math.max(Date.now(), new Date(user.access_expires_at || 0).getTime()))]);
  } else if (action === "generate_code") {
    const accessCode = newAccessCode();
    await query("UPDATE users SET access_code_hash = $2, access_code_hint = $3, status = 'active', access_mode = 'beta_unlimited', updated_at = NOW() WHERE id = $1", [id, await hashAccessCode(accessCode), accessHint(accessCode)]);
    return success({ access_code: accessCode });
  } else if (action === "delete") {
    await query("DELETE FROM users WHERE id = $1 AND role = 'beta_user'", [id]);
    return success({ deleted: true });
  } else {
    throw new AppError("คำสั่งจัดการผู้ใช้ไม่ถูกต้อง", 422, "INVALID_ACTION");
  }

  const updated = (await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]))[0];
  return success({ user: publicUser(updated) });
});
