import { AppError } from "./db.mjs";
import { logRequest, requestId } from "./logging.mjs";

export function json(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export function success(payload = {}, init = {}) {
  return json({ ok: true, ...payload }, init);
}

export function failure(error, id = "") {
  if (error instanceof AppError) {
    return json({ ok: false, error: error.code, code: error.code, message: error.message, request_id: id }, { status: error.status });
  }
  return json({ ok: false, error: "SERVER_ERROR", code: "SERVER_ERROR", message: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง", request_id: id }, { status: 500 });
}

function withRequestId(response, id) {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", id);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function endpoint(handler) {
  return async function vercelFunction(request) {
    const id = requestId(request);
    const started = Date.now();
    try {
      if (request.method === "OPTIONS") {
        const response = withRequestId(new Response(null, { status: 204, headers: { "cache-control": "no-store" } }), id);
        logRequest({ request, id, status: response.status, durationMs: Date.now() - started });
        return response;
      }
      const response = withRequestId(await handler(request), id);
      logRequest({ request, id, status: response.status, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      const response = withRequestId(failure(error, id), id);
      logRequest({ request, id, status: response.status, durationMs: Date.now() - started, errorCode: error?.code || "SERVER_ERROR" });
      return response;
    }
  };
}

export function requireMethod(request, allowed) {
  const methods = Array.isArray(allowed) ? allowed : [allowed];
  if (!methods.includes(request.method)) {
    throw new AppError("ไม่รองรับวิธีเรียกใช้งานนี้", 405, "METHOD_NOT_ALLOWED");
  }
}

export async function parseJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not object");
    }
    return body;
  } catch {
    throw new AppError("รูปแบบข้อมูลไม่ถูกต้อง", 400, "INVALID_JSON");
  }
}

export function stringValue(value, label, maxLength = 255) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) {
    throw new AppError(label + "ไม่ครบหรือยาวเกินกำหนด", 422, "INVALID_INPUT");
  }
  return text;
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new AppError("คำขอจากแหล่งที่มาไม่อนุญาต", 403, "ORIGIN_NOT_ALLOWED");
  }
}

export function readCookies(request) {
  const value = request.headers.get("cookie") || "";
  return Object.fromEntries(
    value.split(";").map((part) => part.trim().split("=")).filter(([key, val]) => key && val).map(([key, ...rest]) => [key, decodeURIComponent(rest.join("="))]),
  );
}

export function cookieHeader(name, value, options = {}) {
  const parts = [name + "=" + encodeURIComponent(value), "Path=" + (options.path || "/")];
  if (options.maxAge !== undefined) parts.push("Max-Age=" + options.maxAge);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  parts.push("SameSite=" + (options.sameSite || "Lax"));
  return parts.join("; ");
}

export function sessionCookie(value) {
  return cookieHeader("tarot_session", value, { maxAge: 60 * 60 * 24 * 7 });
}

export function clearSessionCookie() {
  return cookieHeader("tarot_session", "", { maxAge: 0 });
}

export function withSetCookie(response, value) {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function addClearCookie(response) {
  return withSetCookie(response, clearSessionCookie());
}
