import { timingSafeEqual } from "node:crypto";
import { AppError, query as defaultQuery } from "./db.mjs";

export async function purgeExpiredData(queryFn = defaultQuery) {
  const [readings, usage, audit, buckets] = await Promise.all([
    queryFn("DELETE FROM reading_sessions WHERE status = 'closed' AND updated_at < NOW() - INTERVAL '90 days' RETURNING id", []),
    queryFn("DELETE FROM ai_usage WHERE created_at < NOW() - INTERVAL '180 days' RETURNING id", []),
    queryFn("DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL '180 days' RETURNING id", []),
    queryFn("DELETE FROM rate_limit_buckets WHERE window_start < NOW() - INTERVAL '2 days' RETURNING scope", []),
  ]);
  return { readings: deletedCount(readings), usage: deletedCount(usage), audit: deletedCount(audit), buckets: deletedCount(buckets) };
}

function deletedCount(rows) { return Array.isArray(rows) ? rows.length : Number(rows?.count || 0); }

export function assertCronAuthorization(request, secret = process.env.CRON_SECRET) {
  const expected = String(secret || "");
  const provided = String(request.headers.get("authorization") || "");
  if (expected.length < 32 || !provided.startsWith("Bearer ")) throw new AppError("Cron authorization ไม่ถูกต้อง", 401, "CRON_UNAUTHORIZED");
  const actual = Buffer.from(provided.slice(7));
  const target = Buffer.from(expected);
  if (actual.length !== target.length || !timingSafeEqual(actual, target)) throw new AppError("Cron authorization ไม่ถูกต้อง", 401, "CRON_UNAUTHORIZED");
}
