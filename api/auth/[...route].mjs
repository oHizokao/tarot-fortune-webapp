import { AppError } from "../../lib/vercel/db.mjs";
import { betaLogin, logout, me } from "../../lib/vercel/routes/auth.mjs";
import { endpoint } from "../../lib/vercel/http.mjs";

function routeName(request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  return pathname.split("/").pop() || "";
}

async function dispatch(request) {
  const route = routeName(request);
  if (request.method === "GET" && route === "me") return me(request);
  if (request.method === "POST" && route === "beta-login") return betaLogin(request);
  if (request.method === "POST" && route === "logout") return logout(request);
  throw new AppError("ไม่พบเส้นทาง API นี้", 404, "NOT_FOUND");
}

export const GET = endpoint(dispatch);
export const POST = endpoint(dispatch);
