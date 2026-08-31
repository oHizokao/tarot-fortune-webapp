import { AppError } from "../../lib/vercel/db.mjs";
import { endpoint } from "../../lib/vercel/http.mjs";
import { addMessage, closeReading, createReading, getReading, listReadings, tarotChat } from "../../lib/vercel/routes/ai.mjs";

function parts(request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  const marker = "/api/ai/";
  return pathname.startsWith(marker) ? pathname.slice(marker.length).split("/").filter(Boolean) : [];
}

async function dispatch(request) {
  const route = parts(request);
  if (route.length === 1 && route[0] === "tarot-chat") return tarotChat(request);
  if (route.length === 1 && route[0] === "readings") return request.method === "GET" ? listReadings(request) : createReading(request);
  if (route.length === 2 && route[0] === "readings") return getReading(request, route[1]);
  if (route.length === 3 && route[0] === "readings" && route[2] === "messages") return addMessage(request, route[1]);
  if (route.length === 3 && route[0] === "readings" && route[2] === "close") return closeReading(request, route[1]);
  throw new AppError("ไม่พบเส้นทาง API นี้", 404, "NOT_FOUND");
}

export const GET = endpoint(dispatch);
export const POST = endpoint(dispatch);
