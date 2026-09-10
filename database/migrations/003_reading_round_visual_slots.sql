-- Persist the exact visual deck slots selected by the user. This migration is additive.

ALTER TABLE reading_rounds ADD COLUMN IF NOT EXISTS selected_indexes JSONB;

INSERT INTO schema_migrations (version, name) VALUES (3, 'reading_round_visual_slots') ON CONFLICT (version) DO NOTHING;
