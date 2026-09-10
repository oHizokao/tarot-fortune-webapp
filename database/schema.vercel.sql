-- Fresh-install baseline for Vercel + Neon.
-- Existing databases should use: npm run migrate

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version >= 1),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  last_password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  last_ai_used_at TIMESTAMPTZ
);

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
  deck_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  draw_cursor INTEGER NOT NULL DEFAULT 0 CHECK (draw_cursor >= 0),
  opened_count INTEGER NOT NULL DEFAULT 0 CHECK (opened_count >= 0),
  title VARCHAR(160) NOT NULL DEFAULT 'คำถามใหม่',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reading_sessions_user_updated_idx ON reading_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS reading_rounds (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  question TEXT NOT NULL,
  cards JSONB NOT NULL,
  selected_indexes JSONB,
  answer_json JSONB,
  answer_text TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'drawn' CHECK (status IN ('drawn', 'answered', 'failed')),
  request_id VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, round_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS reading_rounds_session_request_idx ON reading_rounds (session_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reading_rounds_session_number_idx ON reading_rounds (session_id, round_number);

CREATE TABLE IF NOT EXISTS reading_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  round_id UUID REFERENCES reading_rounds(id) ON DELETE SET NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  model VARCHAR(120),
  response_id VARCHAR(160),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reading_messages_session_id_idx ON reading_messages (session_id, id);
CREATE INDEX IF NOT EXISTS reading_messages_round_id_idx ON reading_messages (round_id, id);

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
