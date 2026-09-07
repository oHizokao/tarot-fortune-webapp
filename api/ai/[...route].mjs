import { AppError } from "../../lib/vercel/db.mjs";
import { endpoint } from "../../lib/vercel/http.mjs";
import { addMessage, answerReadingRound, closeReading, createDeckSession, createReading, drawReadingRound, getDeckSession, getReading, listDeckSessions, listReadings, resetDeckSession, tarotChat } from "../../lib/vercel/routes/ai.mjs";

function parts(request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  const marker = "/api/ai/";
  return pathname.startsWith(marker) ? pathname.slice(marker.length).split("/").filter(Boolean) : [];
}

export function flatAiCommand(request) {
  const url = new URL(request.url);
  const readingId = String(url.searchParams.get("reading_id") || "").trim();
  const requestedAction = String(url.searchParams.get("action") || "").trim().toLowerCase();
  if (!readingId && request.method === "GET") return { action: "legacy", readingId: "" };
  if (request.method === "GET") return { action: "detail", readingId };
  if (requestedAction === "message") return { action: "message", readingId };
  if (requestedAction === "close") return { action: "close", readingId };
  return { action: "legacy", readingId };
}

async function dispatch(request) {
  const route = parts(request);
  if (route[0] === "deck-sessions") {
    if (route.length === 1) return request.method === "GET" ? listDeckSessions(request) : createDeckSession(request);
    if (route.length === 2) return getDeckSession(request, route[1]);
    if (route.length === 3 && route[2] === "draw") return drawReadingRound(request, route[1]);
    if (route.length === 3 && route[2] === "reset") return resetDeckSession(request, route[1]);
    if (route.length === 5 && route[2] === "rounds" && route[4] === "answer") return answerReadingRound(request, route[1], route[3]);
  }
  if (route.length === 1 && route[0] === "tarot-chat") {
    const command = flatAiCommand(request);
    if (command.action === "detail") return getReading(request, command.readingId);
    if (command.action === "message") return addMessage(request, command.readingId);
    if (command.action === "close") return closeReading(request, command.readingId);
    return tarotChat(request);
  }
  if (route.length === 1 && route[0] === "readings") return request.method === "GET" ? listReadings(request) : createReading(request);
  if (route.length === 2 && route[0] === "readings") return getReading(request, route[1]);
  if (route.length === 3 && route[0] === "readings" && route[2] === "messages") return addMessage(request, route[1]);
  if (route.length === 3 && route[0] === "readings" && route[2] === "close") return closeReading(request, route[1]);
  throw new AppError("ไม่พบเส้นทาง API นี้", 404, "NOT_FOUND");
}

export const GET = endpoint(dispatch);
export const POST = endpoint(dispatch);
