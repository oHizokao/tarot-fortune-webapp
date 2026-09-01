import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4174);
const blockedSegments = new Set([".git", ".vercel", ".openai", "node_modules", "test-results"]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded.replace(/^[/\\]+/, "");
  const segments = relative.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === ".." || blockedSegments.has(segment))) {
    return null;
  }
  const filePath = path.resolve(root, relative);
  return filePath === root || filePath.startsWith(`${root}${path.sep}`) ? filePath : null;
}

async function resolveFile(urlPath) {
  const requested = safePath(urlPath);
  if (!requested) return null;

  const candidates = [requested];
  if (requested === root || path.extname(requested) === "") {
    candidates.push(path.join(requested, "index.html"));
  }
  if (urlPath === "/") candidates.unshift(path.join(root, "index.html"));

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let filePath;
  try {
    filePath = await resolveFile(request.url || "/");
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const type = contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const stats = await fs.stat(filePath);
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": stats.size,
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(await fs.readFile(filePath));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static test server listening on http://127.0.0.1:${port}`);
});
