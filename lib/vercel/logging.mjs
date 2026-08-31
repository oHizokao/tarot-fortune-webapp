import { randomUUID } from "node:crypto";
import { hashText, verifySession } from "./security.mjs";

export function requestId(request) {
  const incoming = String(request.headers.get("x-request-id") || "").trim();
  return /^[a-zA-Z0-9-]{16,80}$/.test(incoming) ? incoming : randomUUID();
}

export function logRequest({ request, id, status, durationMs, errorCode = "" }) {
  if (process.env.NODE_ENV === "test") return;
  const userId = userIdHash(request);
  console.log(JSON.stringify({ request_id: id, route: new URL(request.url).pathname, method: request.method, status, duration_ms: durationMs, user_id_hash: userId, error_code: errorCode || undefined }));
}

export function userIdHash(request) {
  try {
    const cookie = String(request.headers.get("cookie") || "").split(";").map((part) => part.trim().split("=")).find(([key]) => key === "tarot_session");
    const token = cookie?.[1] ? decodeURIComponent(cookie[1]) : "";
    const session = verifySession(token);
    return session?.userId ? hashText(`tarot-user:${session.userId}`) : "";
  } catch {
    return "";
  }
}
