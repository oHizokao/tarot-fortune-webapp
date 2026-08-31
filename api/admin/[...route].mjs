import { AppError } from "../../lib/vercel/db.mjs";
import { aiCheck, audit, bootstrap, createUser, diagnostics, login, logout, me, retention, settings, updateUser, usage, users } from "../../lib/vercel/routes/admin.mjs";
import { endpoint } from "../../lib/vercel/http.mjs";

function routeName(request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  return pathname.split("/").pop() || "";
}

async function dispatch(request) {
  const route = routeName(request);
  if (request.method === "GET" && route === "me") return me(request);
  if (request.method === "GET" && route === "settings") return settings(request);
  if (request.method === "GET" && route === "usage") return usage(request);
  if (request.method === "GET" && route === "users") return users(request);
  if (request.method === "GET" && route === "diagnostics") return diagnostics(request);
  if (request.method === "GET" && route === "audit") return audit(request);
  if (request.method === "GET" && route === "retention") return retention(request);
  if (request.method !== "POST") throw new AppError("ไม่พบเส้นทาง API นี้", 404, "NOT_FOUND");
  if (route === "bootstrap") return bootstrap(request);
  if (route === "create-user") return createUser(request);
  if (route === "login") return login(request);
  if (route === "logout") return logout(request);
  if (route === "ai-check") return aiCheck(request);
  if (route === "settings") return settings(request);
  if (route === "update-user") return updateUser(request);
  throw new AppError("ไม่พบเส้นทาง API นี้", 404, "NOT_FOUND");
}

export const GET = endpoint(dispatch);
export const POST = endpoint(dispatch);
