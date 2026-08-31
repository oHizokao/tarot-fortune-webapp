import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "database", "migrations");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run migrations");
  process.exit(1);
}

const sql = neon(databaseUrl);
await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name VARCHAR(160) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
const files = (await readdir(migrationsDir)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
const appliedRows = await sql`SELECT version FROM schema_migrations ORDER BY version`;
const applied = new Set(appliedRows.map((row) => Number(row.version)));

for (const file of files) {
  const version = Number(file.match(/^\d+/)[0]);
  if (applied.has(version)) continue;
  const source = await readFile(path.join(migrationsDir, file), "utf8");
  const statements = source.split(/;\s*(?=\S)/).map((statement) => statement.trim()).filter(Boolean);
  if (!statements.length) continue;
  await sql.transaction((txn) => statements.map((statement) => txn.unsafe(statement)));
  console.log(`Applied migration ${file}`);
}

console.log("Database migrations complete");
