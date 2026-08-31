CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) UNIQUE,
  password_hash TEXT,
  access_code_hash TEXT UNIQUE,
  access_code_hint VARCHAR(16),
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'beta_user', 'member')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'suspended', 'expired', 'pending')),
  access_mode VARCHAR(30) NOT NULL DEFAULT 'member',
  access_started_at TIMESTAMPTZ,
  access_expires_at TIMESTAMPTZ,
  credits INTEGER NOT NULL DEFAULT 0,
  daily_ai_limit INTEGER NOT NULL DEFAULT 20 CHECK (daily_ai_limit BETWEEN 0 AND 500),
  session_version INTEGER NOT NULL DEFAULT 1,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  last_ai_used_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
UPDATE users SET username = COALESCE(NULLIF(BTRIM(username), ''), 'user_' || id::text) WHERE username IS NULL OR BTRIM(username) = '';
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_ai_limit INTEGER NOT NULL DEFAULT 20;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_changed_at TIMESTAMPTZ;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_daily_ai_limit_check;
ALTER TABLE users ADD CONSTRAINT users_daily_ai_limit_check CHECK (daily_ai_limit BETWEEN 0 AND 500);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_session_version_check;
ALTER TABLE users ADD CONSTRAINT users_session_version_check CHECK (session_version >= 1);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'beta_user', 'member'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'expired', 'pending'));

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);
CREATE INDEX IF NOT EXISTS users_access_expires_idx ON users (access_expires_at);

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_hash CHAR(64) NOT NULL,
  question_text TEXT,
  answer_text TEXT,
  card_ids JSONB NOT NULL,
  model VARCHAR(120),
  response_id VARCHAR(160),
  request_status VARCHAR(20) NOT NULL,
  error_type VARCHAR(120),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage (user_id, created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  encrypted_value TEXT,
  plain_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  scope VARCHAR(40) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject_hash, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_window_idx ON rate_limit_buckets (window_start);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cards JSONB NOT NULL,
  title VARCHAR(160) NOT NULL DEFAULT 'คำถามใหม่',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reading_sessions_user_updated_idx ON reading_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS reading_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  model VARCHAR(120),
  response_id VARCHAR(160),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reading_messages_session_id_idx ON reading_messages (session_id, id);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action VARCHAR(80) NOT NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);

INSERT INTO schema_migrations (version, name) VALUES (1, 'production_foundation') ON CONFLICT (version) DO NOTHING;
