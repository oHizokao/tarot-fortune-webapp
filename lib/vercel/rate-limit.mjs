import { AppError, query } from "./db.mjs";

const loginAttempts = new Map();

export function enforceLoginRateLimit(key, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((timestamp) => timestamp > now - windowMs);
  if (recent.length >= limit) {
    throw new AppError("ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", 429, "RATE_LIMITED");
  }
  recent.push(now);
  loginAttempts.set(key, recent);
}

export async function enforceAiRateLimit(userId, perMinute = 6, perHour = 60) {
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
