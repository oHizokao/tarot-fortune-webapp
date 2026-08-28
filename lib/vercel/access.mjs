import { randomBytes } from "node:crypto";
import { AppError } from "./db.mjs";

const durations = {
  "3h": 3 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export function expiryFromDuration(value, start = Date.now()) {
  const duration = durations[String(value || "")];
  if (!duration) throw new AppError("ระยะเวลา Beta ไม่ถูกต้อง", 422, "INVALID_DURATION");
  return new Date(start + duration).toISOString();
}

export function newAccessCode() {
  return "TF-" + randomBytes(9).toString("base64url").toUpperCase();
}

export function accessHint(code) {
  return String(code).slice(-4);
}
