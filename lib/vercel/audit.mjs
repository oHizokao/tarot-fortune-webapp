import { query as defaultQuery } from "./db.mjs";

const SECRET_KEY = /password|passcode|secret|api[_-]?key|token|hash|encrypted|prompt/i;

export function safeAuditDetails(details = {}) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  return Object.fromEntries(Object.entries(details).filter(([key, value]) => !SECRET_KEY.test(key) && !looksSensitive(value)).map(([key, value]) => [key, safeValue(value)]));
}

export async function writeAudit({ adminUserId, action, targetUserId = null, details = {}, queryFn = defaultQuery }) {
  await queryFn(
    "INSERT INTO admin_audit_log (admin_user_id, action, target_user_id, details, created_at) VALUES ($1, $2, $3, $4::jsonb, NOW())",
    [Number(adminUserId), String(action).slice(0, 80), targetUserId ? Number(targetUserId) : null, JSON.stringify(safeAuditDetails(details))],
  );
}

function safeValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(safeValue);
  if (typeof value === "object") return safeAuditDetails(value);
  return String(value).slice(0, 240);
}

function looksSensitive(value) {
  return typeof value === "string" && (/^(sk|pk)-/i.test(value) || value.length > 500);
}
