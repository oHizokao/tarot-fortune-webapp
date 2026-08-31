export function redactReadiness(checks = {}) {
  const result = {
    ready: Boolean(checks.database?.ok && checks.schema?.ok && checks.admin?.ok && checks.openai?.ok),
    database: Boolean(checks.database?.ok),
    schema: Boolean(checks.schema?.ok),
    admin: Boolean(checks.admin?.ok),
    ai: Boolean(checks.openai?.ok),
  };
  return result;
}

export async function adminReadiness({ query, getOpenAiSettings }) {
  const database = await query("SELECT 1 AS ok", []).then(() => ({ ok: true })).catch(() => ({ ok: false }));
  const schema = database.ok
    ? await query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1", [])
      .then((rows) => ({ ok: Number(rows[0]?.version || 0) >= 1, version: Number(rows[0]?.version || 0) }))
      .catch(() => ({ ok: false, version: 0 }))
    : { ok: false, version: 0 };
  const admin = database.ok
    ? await query("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND status = 'active') AS ok", [])
      .then((rows) => ({ ok: Boolean(rows[0]?.ok) }))
      .catch(() => ({ ok: false }))
    : { ok: false };
  const settings = database.ok
    ? await getOpenAiSettings().catch(() => ({ configured: false, model: "" }))
    : { configured: false, model: "" };
  return {
    database,
    schema,
    admin,
    openai: { ok: Boolean(settings.configured && settings.model), model: settings.model || "" },
  };
}
