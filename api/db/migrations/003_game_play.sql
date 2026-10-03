-- 003_game_play.sql — moteur de session (lot 4) : metadonnees d'univers/lecons, indices, essais de boss.
-- Rejouable (IF NOT EXISTS / IF EXISTS).
--   * universes.meta : lore, personnages, chapitres, competences (tout ce que l'interface affiche, hors solutions)
--   * lessons.meta   : chapitre, competences, intro, duree
--   * play_sessions.hinted_item_ids : items pour lesquels l'indice a ete demande (XP x0.6, mesure cote serveur)
--   * attempts.try_no / is_final : un item de boss peut etre retente tant qu'il reste des vies ;
--     l'unicite (session, item) devient (session, item, essai)

ALTER TABLE universes ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE play_sessions ADD COLUMN IF NOT EXISTS hinted_item_ids integer[] NOT NULL DEFAULT '{}';
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS try_no smallint NOT NULL DEFAULT 1;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT true;
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_session_id_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS attempts_session_item_try_uq ON attempts (session_id, item_id, try_no);
