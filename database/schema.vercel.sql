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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  last_ai_used_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
UPDATE users
SET username = COALESCE(
  NULLIF(BTRIM(username), ''),
  COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9_]+', '_', 'g') FROM 1 FOR 60), ''), 'user') || '_' || id::text
)
WHERE username IS NULL OR BTRIM(username) = '';
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
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
