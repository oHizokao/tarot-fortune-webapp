import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { AppError } from "./db.mjs";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4), "base64");
}

function secret(name) {
  const value = String(process.env[name] || "");
  if (!value) {
    throw new AppError("ยังไม่ได้ตั้งค่า " + name + " ใน Vercel", 503, "SERVER_CONFIG_MISSING");
  }
  return value;
}

function hmac(value) {
  return createHmac("sha256", secret("SESSION_SECRET")).update(value).digest("base64url");
}

export async function hashAccessCode(code) {
  return bcrypt.hash(code, 12);
}

export async function verifyAccessCode(code, hash) {
  return bcrypt.compare(code, hash);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signSession({ userId, role, csrf, sessionVersion = 1 }) {
  const payload = {
    userId: Number(userId),
    role: String(role),
    csrf: String(csrf),
    sessionVersion: Number(sessionVersion),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return encoded + "." + hmac(encoded);
}

export function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = hmac(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded).toString("utf8"));
    if (!payload.userId || !payload.role || !payload.csrf || !Number.isInteger(payload.sessionVersion) || payload.sessionVersion < 1 || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newCsrfToken() {
  return randomBytes(32).toString("hex");
}

function encryptionKey() {
  const configured = String(process.env.APP_ENCRYPTION_KEY || "");
  if (!configured) {
    throw new AppError("ยังไม่ได้ตั้งค่า APP_ENCRYPTION_KEY ใน Vercel", 503, "SERVER_CONFIG_MISSING");
  }
  const decoded = Buffer.from(configured, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(configured).digest();
}

export function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(value) {
  if (!value) return "";
  const [version, ivValue, tagValue, encryptedValue] = String(value).split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
