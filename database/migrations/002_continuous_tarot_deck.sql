-- Continuous tarot deck sessions. This migration is additive and keeps legacy readings intact.

ALTER TABLE reading_sessions ADD COLUMN IF NOT EXISTS deck_order JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE reading_sessions ADD COLUMN IF NOT EXISTS draw_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reading_sessions ADD COLUMN IF NOT EXISTS opened_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reading_rounds (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  question TEXT NOT NULL,
  cards JSONB NOT NULL,
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

ALTER TABLE reading_messages ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES reading_rounds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reading_messages_round_id_idx ON reading_messages (round_id, id);

INSERT INTO schema_migrations (version, name) VALUES (2, 'continuous_tarot_deck') ON CONFLICT (version) DO NOTHING;
