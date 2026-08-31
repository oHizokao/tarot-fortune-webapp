import { AppError, query } from "./db.mjs";
import { hashText } from "./security.mjs";

export async function consumeRateLimit(scope, subject, limit, windowSeconds) {
  const safeWindow = Math.max(1, Math.floor(Number(windowSeconds) || 60));
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const rows = await query(
    `INSERT INTO rate_limit_buckets (scope, subject_hash, window_start, hits)
     VALUES ($1, $2, TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM NOW()) / $3) * $3), 1)
     ON CONFLICT (scope, subject_hash, window_start)
     DO UPDATE SET hits = rate_limit_buckets.hits + 1
     RETURNING hits`,
    [String(scope).slice(0, 40), hashText(subject), safeWindow],
  );
  const hits = Number(rows[0]?.hits || 0);
  if (hits > safeLimit) throw new AppError("ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", 429, "RATE_LIMITED");
  return { hits, limit: safeLimit, windowSeconds: safeWindow };
}

export async function enforceLoginRateLimit(key, limit = 10, windowMs = 60_000) {
  return consumeRateLimit("login", key, limit, Math.ceil(windowMs / 1000));
}

export async function enforceAiRateLimit(userId, perMinute = 6, perHour = 60) {
  await consumeRateLimit("ai-minute", `user:${Number(userId)}`, perMinute, 60);
  await consumeRateLimit("ai-hour", `user:${Number(userId)}`, perHour, 3600);
  const rows = await query(
    "SELECT COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 minute') AS minute_count, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') AS hour_count FROM ai_usage WHERE user_id = $1",
    [Number(userId)],
  );
  const minuteCount = Number(rows[0]?.minute_count || 0);
  const hourCount = Number(rows[0]?.hour_count || 0);
  if (minuteCount >= perMinute || hourCount >= perHour) {
    throw new AppError("ใช้คำขอ AI ถึงขีดจำกัดชั่วคราว กรุณารอสักครู่แล้วลองใหม่", 429, "RATE_LIMITED");
  }
}
