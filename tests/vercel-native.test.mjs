import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");

test("frontend exposes a guest chat preview and uses Vercel endpoint paths", async () => {
  const html = await read("index.html");
  const app = await read("app.js");

  assert.match(html, /id="ai-question-preview"/);
  assert.match(html, /class="topbar-login-button"/);
  assert.doesNotMatch(html, /href="\.\/admin\/"/);
  assert.match(app, /\/api\/auth\/me/);
  assert.doesNotMatch(app, /api\/auth\/me\.php/);
});

test("Vercel functions and Postgres schema exist", async () => {
  const requiredFiles = [
    "api/health.mjs",
    "api/auth/[...route].mjs",
    "api/ai/[...route].mjs",
    "api/admin/[...route].mjs",
    "database/schema.vercel.sql",
  ];

  await Promise.all(requiredFiles.map((file) => fs.access(path.join(root, file))));

  const functions = await Promise.all(requiredFiles.filter((file) => file.endsWith(".mjs")).map((file) => read(file)));
  assert.ok(functions.every((source) => /export const (GET|POST)/.test(source)), "every Vercel function exposes an HTTP method export");
  const apiFiles = (await fs.readdir(path.join(root, "api"), { recursive: true })).filter((file) => file.endsWith(".mjs"));
  assert.equal(apiFiles.length, 4, "Hobby deployment stays within the four-function Vercel architecture");
});

test("admin is a static Vercel page", async () => {
  const html = await read("admin/index.html");

  assert.match(html, /admin\.js/);
  assert.doesNotMatch(html, /<\?php/);
});

test("legacy PHP pages are excluded from Vercel deployment", async () => {
  const vercelIgnore = await read(".vercelignore");
  assert.match(vercelIgnore, /api\/\*\*\/\*\.php/);
  assert.match(vercelIgnore, /admin\/index\.php/);
});
