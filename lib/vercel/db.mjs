import { neon } from "@neondatabase/serverless";

let client;

export class AppError extends Error {
  constructor(message, status = 400, code = "REQUEST_FAILED") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function isDatabaseConfigured() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

export function database() {
  if (!isDatabaseConfigured()) {
    throw new AppError("ยังไม่ได้เชื่อมต่อฐานข้อมูล Vercel/Neon", 503, "DATABASE_NOT_CONFIGURED");
  }
  if (!client) {
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

export async function query(text, params = []) {
  return database().query(text, params);
}

export async function transaction(statements = []) {
  return database().transaction((txn) => statements.map(({ text, params = [] }) => txn.query(text, params)));
}
