-- 002_game_core.sql — noyau du jeu. Postgres 15/16. Dates en timestamptz (UTC).
-- Rejouable : tout est IF NOT EXISTS / DROP TRIGGER IF EXISTS.
-- Ecarts vs research/architecture.md section 3 (decisions DOSSIER sections 2 et 8) :
--   * srs_state = champs FSRS (ts-fsrs) : stability, difficulty, due, state, reps, lapses, last_review
--     (+ elapsed_days, scheduled_days, learning_steps pour reconstruire une carte ts-fsrs)
--   * attempts.rating (1-4 = Again/Hard/Good/Easy FSRS) remplace quality (0-5 SM-2)
--   * users.age_declared_15_at : declaration d'age >= 15 ans, requise pour creer un compte e-mail
--   * items.kind accepte aussi 'truefalse' et 'code' ; items.is_boss ;
--     play_sessions.lives_left (3 vies, boss uniquement, PAS de vies globales)

-- ===================== IDENTITE =====================
CREATE TABLE IF NOT EXISTS users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text,
  email_verified_at   timestamptz,
  is_anonymous        boolean     NOT NULL DEFAULT true,
  age_declared_15_at  timestamptz,
  display_name        text,
  handle              text,
  locale              text        NOT NULL DEFAULT 'fr',
  timezone            text        NOT NULL DEFAULT 'Europe/Paris',
  daily_goal_xp       integer     NOT NULL DEFAULT 30 CHECK (daily_goal_xp BETWEEN 10 AND 500),
  leaderboard_opt_in  boolean     NOT NULL DEFAULT false,
  marketing_opt_in    boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT users_handle_fmt CHECK (handle IS NULL OR handle ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT users_email_when_verified CHECK (is_anonymous OR email IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq  ON users (lower(email)) WHERE email  IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_uq ON users (handle)       WHERE handle IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea       NOT NULL UNIQUE,            -- sha256(token) ; jamais le jeton clair
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS login_tokens (                -- liens magiques : 15 min, usage unique
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text        NOT NULL,
  token_hash      bytea       NOT NULL UNIQUE,
  upgrade_user_id uuid        REFERENCES users(id) ON DELETE CASCADE,   -- l'invite a promouvoir
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS login_tokens_email_idx ON login_tokens (lower(email), created_at DESC);

-- ===================== CONTENU (miroir de data/universes/*) =====================
CREATE TABLE IF NOT EXISTS universes (
  id           smallserial PRIMARY KEY,
  slug         text        NOT NULL UNIQUE,
  title        text        NOT NULL,
  tagline      text        NOT NULL DEFAULT '',
  description  text        NOT NULL DEFAULT '',
  locale       text        NOT NULL DEFAULT 'fr',
  status       text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  sort_order   integer     NOT NULL DEFAULT 0,
  theme        jsonb       NOT NULL DEFAULT '{}',
  content_hash text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lessons (
  id           serial PRIMARY KEY,
  universe_id  smallint    NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  key          text        NOT NULL UNIQUE,            -- '<universe>/<lesson-slug>', stable a vie
  slug         text        NOT NULL,
  title        text        NOT NULL,
  summary      text        NOT NULL DEFAULT '',
  body_md      text        NOT NULL DEFAULT '',
  position     integer     NOT NULL,
  xp_reward    integer     NOT NULL DEFAULT 20,
  status       text        NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published')),
  content_hash text        NOT NULL DEFAULT '',
  archived_at  timestamptz,
  UNIQUE (universe_id, slug)
);
CREATE INDEX IF NOT EXISTS lessons_universe_pos_idx ON lessons (universe_id, position) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS lesson_prereqs (
  lesson_id          integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  requires_lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, requires_lesson_id),
  CHECK (lesson_id <> requires_lesson_id)
);

CREATE TABLE IF NOT EXISTS items (                       -- question / carte
  id           serial PRIMARY KEY,
  lesson_id    integer     NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  key          text        NOT NULL UNIQUE,            -- '<universe>/<lesson>/<item-slug>', stable
  kind         text        NOT NULL CHECK (kind IN ('mcq','multi','truefalse','cloze','ordering','match','flashcard','input','code')),
  difficulty   smallint    NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  position     integer     NOT NULL DEFAULT 0,
  is_boss      boolean     NOT NULL DEFAULT false,
  payload      jsonb       NOT NULL,                   -- enonce, choix, SOLUTION, explication (jamais expose tel quel)
  tags         text[]      NOT NULL DEFAULT '{}',
  content_hash text        NOT NULL DEFAULT '',
  archived_at  timestamptz
);
CREATE INDEX IF NOT EXISTS items_lesson_idx ON items (lesson_id, position) WHERE archived_at IS NULL;

-- ===================== PROGRESSION =====================
CREATE TABLE IF NOT EXISTS user_universes (
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  universe_id    smallint    NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  xp_total       integer     NOT NULL DEFAULT 0,
  started_at     timestamptz NOT NULL DEFAULT now(),
  last_played_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, universe_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    integer      NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status       text         NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','mastered')),
  best_score   numeric(5,2) NOT NULL DEFAULT 0,
  runs         integer      NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS play_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  universe_id   smallint    NOT NULL REFERENCES universes(id),
  lesson_id     integer     REFERENCES lessons(id),
  mode          text        NOT NULL CHECK (mode IN ('lesson','review','challenge')),
  item_ids      integer[]   NOT NULL,                  -- items servis : seules ces reponses sont acceptees
  lives_left    smallint    CHECK (lives_left IS NULL OR lives_left BETWEEN 0 AND 3),  -- boss uniquement ; NULL sinon
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  total_count   smallint    NOT NULL DEFAULT 0,
  correct_count smallint    NOT NULL DEFAULT 0,
  xp_total      integer     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS play_sessions_user_idx ON play_sessions (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS attempts (                    -- journal append-only
  id              bigserial PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      uuid        NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  item_id         integer     NOT NULL REFERENCES items(id),   -- pas de CASCADE : archiver un item conserve ses attempts
  answered_at     timestamptz NOT NULL DEFAULT now(),
  is_correct      boolean     NOT NULL,
  rating          smallint    NOT NULL CHECK (rating BETWEEN 1 AND 4),  -- grade FSRS : 1 Again, 2 Hard, 3 Good, 4 Easy
  response        jsonb       NOT NULL DEFAULT '{}',
  time_ms         integer     CHECK (time_ms IS NULL OR time_ms BETWEEN 0 AND 600000),
  xp_awarded      integer     NOT NULL DEFAULT 0,
  idempotency_key text,
  UNIQUE (session_id, item_id),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS attempts_user_time_idx ON attempts (user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS attempts_item_idx      ON attempts (item_id);

-- Revision espacee FSRS (ts-fsrs) par (user, item). Le lot 5 branche la logique ; ici le schema seul.
CREATE TABLE IF NOT EXISTS srs_state (
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id          integer     NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  state            smallint    NOT NULL DEFAULT 0 CHECK (state IN (0,1,2,3)),  -- ts-fsrs State : 0 New, 1 Learning, 2 Review, 3 Relearning
  stability        real        NOT NULL DEFAULT 0,
  difficulty       real        NOT NULL DEFAULT 0,
  due              timestamptz NOT NULL DEFAULT now(),
  elapsed_days     integer     NOT NULL DEFAULT 0,
  scheduled_days   integer     NOT NULL DEFAULT 0,
  learning_steps   integer     NOT NULL DEFAULT 0,
  reps             integer     NOT NULL DEFAULT 0,
  lapses           integer     NOT NULL DEFAULT 0,
  last_review      timestamptz,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS srs_due_idx ON srs_state (user_id, due);

-- ===================== XP, STREAKS, QUETES, BADGES =====================
CREATE TABLE IF NOT EXISTS xp_events (                   -- grand livre XP idempotent (source de verite)
  id          bigserial PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  universe_id smallint    REFERENCES universes(id),
  amount      integer     NOT NULL CHECK (amount > 0),
  reason      text        NOT NULL,                    -- answer, lesson_complete, quest, streak_bonus, badge
  ref         text        NOT NULL,                    -- (reason, ref) = cle d'idempotence
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reason, ref)
);
CREATE INDEX IF NOT EXISTS xp_events_user_time_idx ON xp_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_activity (              -- 1 ligne / user / jour LOCAL (users.timezone)
  user_id        uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            date    NOT NULL,
  xp             integer NOT NULL DEFAULT 0,
  items_answered integer NOT NULL DEFAULT 0,
  goal_met       boolean NOT NULL DEFAULT false,         -- vrai des 30 XP dans la journee (streak)
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS streaks (                     -- cache recalculable depuis daily_activity
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_days      integer  NOT NULL DEFAULT 0,
  longest_days      integer  NOT NULL DEFAULT 0,
  last_active_day   date,
  freezes_available smallint NOT NULL DEFAULT 1 CHECK (freezes_available BETWEEN 0 AND 3),
  freeze_refill_on  date,                                -- gel gratuit automatique 1/semaine
  frozen_days       date[]   NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS quest_defs (                  -- synchronise depuis data/quests.json
  id          serial PRIMARY KEY,
  slug        text     NOT NULL UNIQUE,
  period      text     NOT NULL CHECK (period IN ('daily','weekly')),
  metric      text     NOT NULL CHECK (metric IN ('items_answered','correct_answers','lessons_completed','reviews_done','xp_earned','perfect_sessions')),
  target      integer  NOT NULL CHECK (target > 0),
  xp_reward   integer  NOT NULL DEFAULT 10,
  universe_id smallint REFERENCES universes(id),        -- NULL = tous univers
  active      boolean  NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS user_quests (
  user_id      uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id     integer NOT NULL REFERENCES quest_defs(id) ON DELETE CASCADE,
  period_start date    NOT NULL,                        -- jour (daily) ou lundi (weekly), date locale
  progress     integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  PRIMARY KEY (user_id, quest_id, period_start)
);

CREATE TABLE IF NOT EXISTS badges (
  id          serial PRIMARY KEY,
  slug        text  NOT NULL UNIQUE,
  title       text  NOT NULL,
  description text  NOT NULL DEFAULT '',
  criteria    jsonb NOT NULL DEFAULT '{}'               -- ex. {"type":"streak","days":7}
);
CREATE TABLE IF NOT EXISTS user_badges (
  user_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id  integer     NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- ===================== CLASSEMENTS =====================
CREATE TABLE IF NOT EXISTS leaderboard_weekly (          -- upsert avec chaque xp_event ; universe_id = 0 -> global
  week_start  date        NOT NULL,                    -- lundi UTC
  universe_id smallint    NOT NULL DEFAULT 0,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp          integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, universe_id, user_id)
);
CREATE INDEX IF NOT EXISTS leaderboard_rank_idx ON leaderboard_weekly (week_start, universe_id, xp DESC);

-- ===================== ANALYTICS MINIMALES =====================
CREATE TABLE IF NOT EXISTS analytics_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  name       text        NOT NULL CHECK (name IN ('guest_created','account_upgraded','session_started','session_finished','review_started','lesson_completed','streak_extended','quest_completed','share_clicked')),
  props      jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_name_time_idx ON analytics_events (name, created_at DESC);

-- ===================== TRIGGERS (update_updated_at_column() creee en 001) =====================
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS universes_updated_at ON universes;
CREATE TRIGGER universes_updated_at       BEFORE UPDATE ON universes       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS lesson_progress_updated_at ON lesson_progress;
CREATE TRIGGER lesson_progress_updated_at BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
