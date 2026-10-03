# Architecture technique cible — MakeMeLearn (jeu d'apprentissage multi-univers)

Rôle : agent ARCHITECTURE TECHNIQUE. Date : 2026-10-03. Base : audit du dépôt `makemelearn-landing` (158 commits).
Pas de sous-agents : le dépôt est assez petit (~4 900 lignes hors CSS/HTML) pour un audit direct.

---------------------------------------------------------------------------

## 1. Audit de l'existant

### 1.1 Inventaire
| Zone | Contenu | Verdict |
|---|---|---|
| `index.html` (240 l.), `pages/*.html` (about, faq, how-it-works, privacy, terms, contact) | Landing + pages info | Contenu et SEO de base réutilisables (meta, OG, sitemap). Gabarit à factoriser dans le générateur statique. |
| `css/style.css` (1052 l.), `css/mobile.css` | Design landing | Récupérer les tokens (couleurs, polices) en variables CSS ; le reste à réécrire pour l'UI de jeu. |
| `script.js` (632 l.) et `js/app.js` (708 l.) | Deux implémentations quasi dupliquées (newsletter, contact, notifications, scroll) ; seul `js/app.js` est chargé (`type=module`) | **Dette** : `script.js` mort/dupliqué. `API_BASE_URL` codée en dur 4 fois (script.js, app.js, contact-form.js, contact-form-init.js) avec des formats différents. |
| `components/` (header, footer, form, loader) | Composants maison rendus par `innerHTML` | Concept réutilisable (header/footer partagés) mais remplacé par includes au build ; `innerHTML` + données utilisateur (pseudos du classement) = risque XSS. |
| `api/src/` (Express 4, pg, winston, helmet, rate-limit, validator) | routes `registrations`, `contact`, `stats`, `health`; logger, errorHandler, requestLogger | Réutilisable : `config/database.js`, `logger.js`, `errorHandler.js` (contient un `asyncHandler` **jamais utilisé**), validations, logique inscription/contact. |
| `api/server.js` (487 l.) | Second serveur complet à la racine, doublon de `src/server.js` (le Dockerfile lance `src/server.js`) | **Code mort** à supprimer. |
| `database/init.sql` | `registrations`, `stats`, fonctions, vue | Exécuté uniquement via `docker-entrypoint-initdb.d` (volume vide) : aucune évolution de schéma possible -> migrations versionnées. |
| `docker-compose.yml` | 3 services (postgres, api, nginx), build sur le VPS | Hors pattern (1.2). |
| `.github/workflows/deploy.yml` (704 l.) | tests puis SSH `appleboy/ssh-action` `SERVER_HOST:SERVER_PORT||22`, `git clone/stash/pull`, `docker compose build --no-cache` sur le VPS, `down` puis `up` (coupure) | Hors pattern (1.2). |
| `nginx/nginx.conf` | Statique + headers | Disparaît dans la cible (Express sert `dist/`). |

### 1.2 Failles et non-conformités

**CRITIQUE**
1. **Fichiers internes probablement servis publiquement (à vérifier : `curl -I https://makemelearn.fr/docker-compose.yml`)** : le conteneur `frontend` monte `./:/usr/share/nginx/html:ro`, donc **tout le dépôt** est la racine web. `location /` fait `try_files $uri` : `/docker-compose.yml` (mot de passe Postgres), `/database/init.sql`, `/.env.example`-like, `/CI-CD-*.md`, `/nginx/nginx.conf` sont servis (seuls les dotfiles sont bloqués ; `/api/` est capté par Traefik). -> servir uniquement un `dist/` produit au build.
2. **Mot de passe Postgres en clair, versionné** : `[REDACTED]` dans `docker-compose.yml` (2 fois dont `DATABASE_URL`), `.env.example`, et dans l'historique git. Postgres n'est pas publié sur l'hôte (réseau interne), risque limité mais **rotation obligatoire** ; secrets runtime uniquement dans un `.env` créé à la main sur le VPS.
3. **Handlers async Express 4 non protégés + `unhandledRejection` -> `process.exit(1)`** (`src/server.js:166`) : 18 `try/catch` manuels, mais aucun `asyncHandler` branché (celui d'`errorHandler.js` est mort), et les promesses non awaitées (`registrations.js:118` envoi d'email "ne pas attendre", validators `.custom(async)`) peuvent rejeter hors try/catch -> un seul rejet tue le process entier (bug de prod déjà vécu ailleurs). -> wrapper `safe()` obligatoire sur toute route + `unhandledRejection` loggé sans exit (exit seulement sur `uncaughtException`, `restart: unless-stopped` relève).
4. **Déploiement hors pattern** : SSH direct port 22 au lieu de `cloudflared access ssh` + service token Cloudflare Access ; build des images sur le VPS au lieu de GHCR ; `docker compose down` avant `up` ; secrets `SERVER_*` au lieu de `SSH_*`/`CF_ACCESS_*`/`GHCR_PAT`/`VPS_DEPLOY_PATH`.

**ÉLEVÉ**
5. **Pas de `trust proxy`** derrière Traefik + Cloudflare : `req.ip` = IP de Traefik, donc **tous les visiteurs partagent le même quota** (100 req/15 min, 5 inscriptions/h globaux) : un attaquant épuise le quota de tous. -> `trust proxy` à 2 sauts.
6. **Auth factice sur `/stats/system`** : accepte n'importe quel `Bearer xxx` (seul le préfixe est testé). `/health/metrics` et `/health/detailed` publics. `/health/maintenance` compare à `process.env.MAINTENANCE_TOKEN` : variable absente -> `Bearer undefined` passe ; comparaison non constante. -> supprimer ou protéger (token + `timingSafeEqual`), réseau interne seulement.
7. **`POST /stats/track` anonyme** : écrit n'importe quel nom d'événement alphanumérique dans `stats` (pollution/DoS stockage). -> supprimer, remplacé par `analytics_events` à liste blanche.
8. **CSP** nginx `default-src 'self' http: https: data: blob: 'unsafe-inline'` = quasi inopérante. -> CSP stricte `script-src 'self'` (aucun script inline).
9. **CORS** `credentials: true` + origine `creach-t.github.io` : inutile en same-origin, dangereux avec cookies de session.

**MOYEN / DETTE**
10. `express.json({limit:'10mb'})` : ramener à 32 kb. `X-Powered-By` custom, triple journalisation (morgan + requestLogger + winston), emojis dans les logs.
11. `DELETE /registrations/unsubscribe/:email` **sans jeton** : n'importe qui désinscrit n'importe qui + énumération (404/200). -> lien signé HMAC.
12. `test-components.html` et 4 fichiers `CI-CD-*.md` (journaux de debug) à la racine : archiver/supprimer.
13. Node 18 en CI (EOL) vs Node 20 dans le Dockerfile ; `npm install --only=production` -> `npm ci --omit=dev` ; `@sendgrid/mail` + `nodemailer` en doublon.
14. Healthcheck de l'API dépend de la DB : si Postgres redémarre, l'API est redémarrée en boucle. -> `/healthz` (liveness, sans DB) + `/readyz`.
15. Front : `innerHTML` partout, aucun test front.

### 1.3 Réutilisable
`api/src/config/database.js` (pool pg ; retirer l'option inconnue `acquireTimeoutMillis`), `utils/logger.js`, `errorHandler.js` (`notFound`, `errorHandler`, brancher `asyncHandler` comme `safe`), logique et validations `registrations.js`/`contact.js` (module waitlist/contact), contenu/SEO des `pages/*.html`, `robots.txt`, `fav/`, tokens CSS.

---------------------------------------------------------------------------

## 2. Décisions d'architecture (tranchées)

| Sujet | Décision | Justification |
|---|---|---|
| Front | **Vanilla JS modules ES + Vite (MPA), sans framework** | Un build est de toute façon nécessaire (hash de cache, minification, CSP stricte sans inline, tests Vitest, intégration du SEO généré). Vite = 1 dépendance de dev, zéro runtime. L'UI = ~6 écrans (accueil/univers, carte, session de questions, révision, profil, classement) : mini routeur + fonctions `render()` suffisent. Réévaluer Preact (3 kB) si > ~15 écrans. |
| Service | **Un seul conteneur applicatif** `ghcr.io/creach-t/makemelearn` : Express 4 sert `dist/` et `/api/v1/*`, plus un conteneur `postgres` sidecar privé | Respecte "1 conteneur/projet" (Postgres = dépendance). Same-origin : plus de CORS ni de `stripprefix`. Nginx supprimé (`express.static` + `immutable` sur `/assets/*`, Cloudflare en cache). |
| API | Express 4 conservé, structure par module, **`safe()` obligatoire**, validation **zod**, pas de TypeScript en v1 | Réutilise l'existant. |
| DB | Postgres 16, migrations SQL numérotées (`api/db/migrations/NNN_*.sql`) appliquées au boot sous `pg_advisory_lock` (table `schema_migrations`), requêtes `pg` paramétrées, pas d'ORM | `init.sql` ne sert qu'à un volume vide. |
| Auth | **Invité anonyme** (cookie de session, ligne `users.is_anonymous=true`) puis **upgrade en compte par lien magique** ; même `user_id` donc progression conservée ; aucun mot de passe en v1 | Zéro friction avant la 1re question ; pas de reset de mot de passe. Fusion de deux comptes = lot ultérieur. |
| Session | Jeton opaque 256 bits, **hash SHA-256 seul stocké**, cookie `mml_sid` `HttpOnly; Secure; SameSite=Lax`, 180 j glissants. CSRF : SameSite=Lax + en-tête `X-MML: 1` obligatoire sur mutations + contrôle `Origin` | Simple, révocable, pas de JWT. |
| Contenu | **JSON versionné** `data/universes/<slug>/`, validé (JSON Schema/ajv) en CI, synchronisé en DB au démarrage (upsert par `key` stable, jamais de DELETE -> `archived_at`) | Revue par PR, diffs lisibles, pas de back-office en v1. |
| SEO | Générateur Node (`scripts/build-seo.mjs`) après Vite : pages univers/leçons pré-rendues + JSON-LD + sitemap | Indexable sans JS ; écrans de jeu `noindex`. |
| SRS | **SM-2 simplifié** serveur ; colonnes `state/stability/difficulty` réservées pour FSRS | Suffisant, explicable. |
| Engagement sain | Streak avec **gel automatique** (1/semaine), objectif quotidien réglable, classement **opt-in**, pas de vies ni de notifications culpabilisantes | Cohérent avec l'objectif du projet. |
| Analytics | `analytics_events` interne à liste blanche, aucun tiers | RGPD simple ; cookie de session = strictement nécessaire. |

### Arborescence cible
```
data/universes/<slug>/universe.json
data/universes/<slug>/lessons/<NN>-<lesson-slug>.json
data/schema/{universe,lesson}.schema.json   data/quests.json   data/badges.json
scripts/{validate-content,sync-content,build-seo,check-seo,check-safe}.mjs
web/ (racine Vite)  index.html  jouer/index.html  src/{main,router,api,state}.js  src/screens/*  src/styles/*  public/{fav,robots.txt}
api/src/{app.js,server.js,config/env.js,lib/{safe,db,logger,errors,auth,srs,xp,streak,week,grading,mailer,migrate}.js}
api/src/modules/{auth,me,universes,sessions,reviews,progress,quests,leaderboard,waitlist,contact,health}/
api/db/migrations/001_legacy.sql 002_game_core.sql ...      api/test/
Dockerfile (multi-stage)  docker-compose.yml (dev)  docker-compose.prod.yml  .github/workflows/ci-cd.yml
```

### `safe()` (api/src/lib/safe.js)
```js
// Express 4 n'attrape pas les rejets des handlers async : TOUTE route passe par safe().
const safe = (fn) => (req, res, next) =>
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
module.exports = { safe };
// usage : router.post('/answers', requireUser, safe(async (req, res) => { ... }));
// process : unhandledRejection => logger.error sans exit ; uncaughtException => log + exit(1) (Docker relance)
// CI : scripts/check-safe.mjs échoue si router.(get|post|put|patch|delete) reçoit une fonction async non enveloppée
```

### Contrat API (`/api/v1`, JSON, same-origin)
| Méthode | Route | Rôle |
|---|---|---|
| POST | `/auth/guest` | Crée l'invité + pose le cookie (idempotent si cookie valide). |
| POST | `/auth/magic-link` `{email}` | Envoie le lien (202 toujours, anti-énumération ; rate limit IP+email). |
| GET | `/auth/verify?token=` | Consomme le lien : upgrade l'invité courant (ou connecte le compte existant). |
| POST | `/auth/logout` | Révoque la session. |
| GET/PATCH/DELETE | `/me` | Profil (pseudo, fuseau, objectif quotidien, opt-in classement/marketing) ; DELETE = suppression RGPD. |
| GET | `/universes`, `/universes/:slug` | Liste / carte des leçons + progression. |
| POST | `/sessions` `{universe, lesson?, mode: lesson/review/challenge}` | Démarre une session ; items **sans solutions**. |
| POST | `/sessions/:id/answers` `{itemId, response, timeMs}` + `Idempotency-Key` | Correction serveur, XP, SRS ; renvoie `{correct, explanation, xp, streak, quests}`. |
| POST | `/sessions/:id/finish` | Clôture, bonus, progression de leçon, badges. |
| GET | `/reviews/due?universe=` | Cartes dues + compteur. |
| GET | `/progress` | XP, niveau, streak, objectif du jour, carte de chaleur 90 j. |
| GET | `/quests` | Quêtes jour/semaine. |
| GET | `/leaderboard?universe=&period=week` | Top N + rang de l'utilisateur (opt-in seulement). |
| POST | `/waitlist`, `/contact` | Existant (ex-`/registrations`), anciens chemins en alias 1 release. |
| GET | `/healthz`, `/readyz` | Liveness sans DB / readiness avec DB. |

Rate limiting : par IP (via `trust proxy`) sur routes publiques ; par `user_id` sur `/answers` (ex. 120/min). XP calculé serveur ; plafond d'XP/jour par univers pour le classement uniquement (anti-farm).

---------------------------------------------------------------------------

## 3. Schéma Postgres (prêt à coller — `api/db/migrations/002_game_core.sql`)

`001_legacy.sql` = l'actuel `init.sql` repris tel quel (`IF NOT EXISTS`) pour ne pas toucher la prod existante ; le runner marque 001 comme appliquée si `registrations` existe déjà.

```sql
-- 002_game_core.sql — noyau du jeu. Postgres 16. Dates en timestamptz (UTC).

-- ===================== IDENTITÉ =====================
CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text,
  email_verified_at   timestamptz,
  is_anonymous        boolean     NOT NULL DEFAULT true,
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
CREATE UNIQUE INDEX users_email_uq  ON users (lower(email)) WHERE email  IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX users_handle_uq ON users (handle)       WHERE handle IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE auth_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea       NOT NULL UNIQUE,            -- sha256(token) ; jamais le jeton clair
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  user_agent   text
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE login_tokens (                             -- liens magiques : 15 min, usage unique
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text        NOT NULL,
  token_hash      bytea       NOT NULL UNIQUE,
  upgrade_user_id uuid        REFERENCES users(id) ON DELETE CASCADE,   -- l'invité à promouvoir
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz
);
CREATE INDEX login_tokens_email_idx ON login_tokens (lower(email), created_at DESC);

-- ===================== CONTENU (miroir de data/universes/*) =====================
CREATE TABLE universes (
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

CREATE TABLE lessons (
  id           serial PRIMARY KEY,
  universe_id  smallint    NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  key          text        NOT NULL UNIQUE,            -- '<universe>/<lesson-slug>', stable à vie
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
CREATE INDEX lessons_universe_pos_idx ON lessons (universe_id, position) WHERE archived_at IS NULL;

CREATE TABLE lesson_prereqs (
  lesson_id          integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  requires_lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, requires_lesson_id),
  CHECK (lesson_id <> requires_lesson_id)
);

CREATE TABLE items (                                    -- question / carte
  id           serial PRIMARY KEY,
  lesson_id    integer     NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  key          text        NOT NULL UNIQUE,            -- '<universe>/<lesson>/<item-slug>', stable
  kind         text        NOT NULL CHECK (kind IN ('mcq','multi','cloze','ordering','match','flashcard','input')),
  difficulty   smallint    NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  position     integer     NOT NULL DEFAULT 0,
  payload      jsonb       NOT NULL,                   -- énoncé, choix, SOLUTION, explication (jamais exposé tel quel)
  tags         text[]      NOT NULL DEFAULT '{}',
  content_hash text        NOT NULL DEFAULT '',
  archived_at  timestamptz
);
CREATE INDEX items_lesson_idx ON items (lesson_id, position) WHERE archived_at IS NULL;

-- ===================== PROGRESSION =====================
CREATE TABLE user_universes (
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  universe_id    smallint    NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  xp_total       integer     NOT NULL DEFAULT 0,
  started_at     timestamptz NOT NULL DEFAULT now(),
  last_played_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, universe_id)
);

CREATE TABLE lesson_progress (
  user_id      uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    integer      NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status       text         NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','mastered')),
  best_score   numeric(5,2) NOT NULL DEFAULT 0,
  runs         integer      NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE play_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  universe_id   smallint    NOT NULL REFERENCES universes(id),
  lesson_id     integer     REFERENCES lessons(id),
  mode          text        NOT NULL CHECK (mode IN ('lesson','review','challenge')),
  item_ids      integer[]   NOT NULL,                  -- items servis : seules ces réponses sont acceptées
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  total_count   smallint    NOT NULL DEFAULT 0,
  correct_count smallint    NOT NULL DEFAULT 0,
  xp_total      integer     NOT NULL DEFAULT 0
);
CREATE INDEX play_sessions_user_idx ON play_sessions (user_id, started_at DESC);

CREATE TABLE attempts (                                 -- journal append-only
  id              bigserial PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      uuid        NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  item_id         integer     NOT NULL REFERENCES items(id),
  answered_at     timestamptz NOT NULL DEFAULT now(),
  is_correct      boolean     NOT NULL,
  quality         smallint    NOT NULL CHECK (quality BETWEEN 0 AND 5),   -- façon SM-2, dérivé
  response        jsonb       NOT NULL DEFAULT '{}',
  time_ms         integer     CHECK (time_ms IS NULL OR time_ms BETWEEN 0 AND 600000),
  xp_awarded      integer     NOT NULL DEFAULT 0,
  idempotency_key text,
  UNIQUE (session_id, item_id),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX attempts_user_time_idx ON attempts (user_id, answered_at DESC);
CREATE INDEX attempts_item_idx      ON attempts (item_id);

CREATE TABLE srs_state (                                -- révision espacée par (user, item)
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id          integer     NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  state            smallint    NOT NULL DEFAULT 0 CHECK (state IN (0,1,2,3)),  -- new, learning, review, relearning
  ease             real        NOT NULL DEFAULT 2.5 CHECK (ease BETWEEN 1.3 AND 3.5),
  interval_days    integer     NOT NULL DEFAULT 0,
  reps             integer     NOT NULL DEFAULT 0,
  lapses           integer     NOT NULL DEFAULT 0,
  stability        real,                               -- réservés FSRS
  difficulty       real,
  due_at           timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX srs_due_idx ON srs_state (user_id, due_at);

-- ===================== XP, STREAKS, QUÊTES, BADGES =====================
CREATE TABLE xp_events (                                -- grand livre XP idempotent (source de vérité)
  id          bigserial PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  universe_id smallint    REFERENCES universes(id),
  amount      integer     NOT NULL CHECK (amount > 0),
  reason      text        NOT NULL,                    -- answer, lesson_complete, quest, streak_bonus, badge
  ref         text        NOT NULL,                    -- (reason, ref) = clé d'idempotence
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reason, ref)
);
CREATE INDEX xp_events_user_time_idx ON xp_events (user_id, created_at DESC);

CREATE TABLE daily_activity (                           -- 1 ligne / user / jour LOCAL (users.timezone)
  user_id        uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            date    NOT NULL,
  xp             integer NOT NULL DEFAULT 0,
  items_answered integer NOT NULL DEFAULT 0,
  goal_met       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE streaks (                                  -- cache recalculable depuis daily_activity
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_days      integer  NOT NULL DEFAULT 0,
  longest_days      integer  NOT NULL DEFAULT 0,
  last_active_day   date,
  freezes_available smallint NOT NULL DEFAULT 1 CHECK (freezes_available BETWEEN 0 AND 3),
  freeze_refill_on  date,
  frozen_days       date[]   NOT NULL DEFAULT '{}'
);

CREATE TABLE quest_defs (                               -- synchronisé depuis data/quests.json
  id          serial PRIMARY KEY,
  slug        text     NOT NULL UNIQUE,
  period      text     NOT NULL CHECK (period IN ('daily','weekly')),
  metric      text     NOT NULL CHECK (metric IN ('items_answered','correct_answers','lessons_completed','reviews_done','xp_earned','perfect_sessions')),
  target      integer  NOT NULL CHECK (target > 0),
  xp_reward   integer  NOT NULL DEFAULT 10,
  universe_id smallint REFERENCES universes(id),        -- NULL = tous univers
  active      boolean  NOT NULL DEFAULT true
);

CREATE TABLE user_quests (
  user_id      uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id     integer NOT NULL REFERENCES quest_defs(id) ON DELETE CASCADE,
  period_start date    NOT NULL,                        -- jour (daily) ou lundi (weekly), date locale
  progress     integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  PRIMARY KEY (user_id, quest_id, period_start)
);

CREATE TABLE badges (
  id          serial PRIMARY KEY,
  slug        text  NOT NULL UNIQUE,
  title       text  NOT NULL,
  description text  NOT NULL DEFAULT '',
  criteria    jsonb NOT NULL DEFAULT '{}'               -- ex. {"type":"streak","days":7}
);
CREATE TABLE user_badges (
  user_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id  integer     NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

-- ===================== CLASSEMENTS =====================
CREATE TABLE leaderboard_weekly (                       -- upsert avec chaque xp_event ; universe_id = 0 -> global
  week_start  date        NOT NULL,                    -- lundi UTC
  universe_id smallint    NOT NULL DEFAULT 0,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp          integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, universe_id, user_id)
);
CREATE INDEX leaderboard_rank_idx ON leaderboard_weekly (week_start, universe_id, xp DESC);
-- Lecture : JOIN users WHERE leaderboard_opt_in AND deleted_at IS NULL ; purge > 12 semaines par la maintenance.

-- ===================== ANALYTICS MINIMALES =====================
CREATE TABLE analytics_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  name       text        NOT NULL CHECK (name IN ('guest_created','account_upgraded','session_started','session_finished','review_started','lesson_completed','streak_extended','quest_completed','share_clicked')),
  props      jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_name_time_idx ON analytics_events (name, created_at DESC);

-- ===================== TRIGGERS (update_updated_at_column() créée en 001) =====================
CREATE TRIGGER users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER universes_updated_at       BEFORE UPDATE ON universes       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER lesson_progress_updated_at BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```
Notes de conception :
- XP du classement = `leaderboard_weekly`, écrit **dans la même transaction** que la réponse et `xp_events` ; `streaks` et `user_universes.xp_total` sont des caches reconstruisibles.
- Les `key` de contenu ne changent jamais (renommer un titre n'invalide aucune progression) ; retirer une question = `archived_at`.
- RGPD : `DELETE /me` supprime `users` (cascade sur tout) ; `analytics_events.user_id` passe à NULL.
- `registrations` reste inchangée (waitlist) ; `stats` figée, supprimée en migration ultérieure.

---------------------------------------------------------------------------

## 4. Contenu des univers (JSON versionné)

```jsonc
// data/universes/web-basics/universe.json
{ "schema": 1, "slug": "web-basics", "title": "Les bases du web", "tagline": "...", "locale": "fr",
  "status": "published", "sortOrder": 10, "theme": { "color": "#6C5CE7", "icon": "globe" } }

// data/universes/web-basics/lessons/01-html-structure.json
{ "schema": 1, "slug": "html-structure", "title": "Structurer une page", "position": 1, "xpReward": 20,
  "summary": "...", "prerequisites": [], "bodyMd": "## Idée clé\n...",
  "items": [
    { "slug": "q-title-tag", "kind": "mcq", "difficulty": 1, "tags": ["html"],
      "question": "Quelle balise définit le titre principal ?",
      "choices": ["<h1>", "<title>", "<head>"], "answer": 0, "explanation": "..." },
    { "slug": "q-order", "kind": "ordering", "difficulty": 3, "prompt": "...",
      "steps": ["a", "b", "c"], "answer": [2, 0, 1], "explanation": "..." } ] }
```
- Clés DB : `lessons.key = "<universe>/<lesson-slug>"`, `items.key = "<universe>/<lesson-slug>/<item-slug>"`. Les `slug` sont immuables (vérifié en CI par comparaison avec `main`).
- `scripts/validate-content.mjs` (ajv) : slugs uniques, `answer` cohérent avec `kind`, prérequis existants et sans cycle, longueurs max, markdown sans HTML brut.
- `scripts/sync-content.mjs` : upsert idempotent en transaction au démarrage si `content_hash` change ; jamais de DELETE ; rejouable en CI sur un Postgres jetable.
- `answer`/`explanation` jamais envoyés avant la réponse ; choix mélangés côté serveur.
- Les pages SEO consomment les mêmes JSON (cours + 2-3 questions d'aperçu avec réponse visible).

---------------------------------------------------------------------------

## 5. SEO statique

`scripts/build-seo.mjs` (après `vite build`, sortie dans `dist/`) génère depuis `data/` + gabarit commun :
- `/univers/`, `/univers/<slug>/` (description, plan des leçons, CTA "Jouer"), `/univers/<slug>/<lesson>/` (cours + aperçu quiz, CTA).
- Par page : `<title>`, meta description, `canonical`, OG/Twitter, **JSON-LD** (`Course`, `LearningResource`/`Quiz`, `BreadcrumbList`), `lang="fr"`.
- `sitemap.xml` + `robots.txt` générés ; pages existantes (`pages/*.html`) reprises dans le même gabarit.
- Écrans de jeu (`/jouer/...`) : `noindex`, hydratés par `src/main.js` ; les pages SEO chargent le même bundle (bouton "Jouer" en amélioration progressive, contenu lisible sans JS).
- Un seul CSS externe haché (CSP sans inline), polices auto-hébergées (supprimer Google Fonts : RGPD, CSP, perf).
- `scripts/check-seo.mjs` en CI : un seul `<h1>`, canonical, JSON-LD parseable, liens internes résolus.

---------------------------------------------------------------------------

## 6. Déploiement VPS (pattern standard)

```
push main -> GitHub Actions : validate-content + tests (API + service postgres, front Vitest) -> vite build + SEO
 -> docker build multi-stage -> push ghcr.io/creach-t/makemelearn:{sha,latest}
 -> cloudflared access ssh (service token) -> copie docker-compose.prod.yml -> docker compose pull && up -d
 -> Traefik Host(`makemelearn.fr`) (+ www -> apex) -> HTTPS Let's Encrypt
```
- Workflow : recopier `.github/workflows/ci-cd.yml` de `modern-cv-react` / Cashly (absent localement) en remplacement de `deploy.yml`. Secrets GitHub à déclarer : `SSH_HOSTNAME`, `SSH_USER`, `SSH_PRIVATE_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `VPS_DEPLOY_PATH` (proposé `/opt/deployments/makemelearn`), `GHCR_PAT`. Aucun secret runtime dans GitHub (DB, SMTP, SESSION_SECRET : `.env` créé à la main sur le VPS).
- `docker-compose.prod.yml` (extrait) :
```yaml
services:
  app:
    image: ghcr.io/creach-t/makemelearn:latest
    restart: unless-stopped
    env_file: .env                 # DATABASE_URL, SESSION_SECRET, SMTP_*, MAINTENANCE_TOKEN (hand-made)
    environment: { NODE_ENV: production, PORT: "3000", TRUST_PROXY_HOPS: "2" }
    depends_on: { db: { condition: service_healthy } }
    networks: [traefik-public, internal]
    healthcheck: { test: ["CMD","wget","-qO-","http://localhost:3000/healthz"], interval: 30s, timeout: 5s, retries: 3 }
    labels:
      - traefik.enable=true
      - traefik.docker.network=traefik-public
      - traefik.http.routers.makemelearn.rule=Host(`makemelearn.fr`) || Host(`www.makemelearn.fr`)
      - traefik.http.routers.makemelearn.entrypoints=websecure
      - traefik.http.routers.makemelearn.tls.certresolver=myresolver
      - traefik.http.routers.makemelearn.middlewares=mml-www
      - traefik.http.middlewares.mml-www.redirectregex.regex=^https://www\.makemelearn\.fr/(.*)
      - traefik.http.middlewares.mml-www.redirectregex.replacement=https://makemelearn.fr/$${1}
      - traefik.http.services.makemelearn.loadbalancer.server.port=3000
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env                 # POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
    volumes: ["makemelearn_postgres_data:/var/lib/postgresql/data"]
    networks: [internal]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"], interval: 10s, retries: 5 }
networks: { traefik-public: { external: true }, internal: {} }
volumes: { makemelearn_postgres_data: { external: true, name: makemelearn_postgres_data } }
```
  Attention : PG 15 -> 16 sur un volume existant exige un dump/restore ; si on veut éviter ça, garder `postgres:15-alpine` pour la bascule (question ouverte).
- Les routeurs Traefik actuels (`makemelearn-api`, `makemelearn-frontend`, middleware `redirect-to-https`) disparaissent avec l'ancienne stack (sinon conflit de noms).
- Sauvegardes : `pg_dump` quotidien (cron VPS, 14 jours) + procédure de restauration testée.
- Monitoring : `makemelearn.fr` est **déjà** dans le job blackbox `sites` (liste du 2026-09-29) -> aucune action Prometheus ; uptime seul, pas de prom-client.
- Bascule : (1) créer à la main `/opt/deployments/makemelearn/.env` avec un **nouveau** mot de passe DB et `ALTER USER ... PASSWORD` sur la base existante ; (2) `pg_dump` de sécurité ; (3) `down` de l'ancienne stack (~1 min de coupure) ; (4) premier `up -d` sur le même volume nommé (migration 001 no-op puis 002+) ; (5) vérifier `curl -I https://makemelearn.fr/docker-compose.yml` -> 404. (Pas d'accès SSH depuis les sessions : fournir les commandes exactes à exécuter et coller le résultat.)

---------------------------------------------------------------------------

## 7. Lots d'implémentation (ordonnés, livrables séparément)

Tests : API = Jest/Vitest + supertest contre un Postgres de CI ; front = Vitest + jsdom (+ Playwright pour le parcours) ; contenu = `validate-content`. Une PR par lot, CI verte avant merge.

### Lot 0 — Correctifs sécurité immédiats sur la stack actuelle (0,5 j) — avant tout
- Fichiers : `docker-compose.yml`, `.env.example`, `nginx/nginx.conf`, `api/src/server.js`, `api/src/routes/{stats,health,registrations}.js`, `api/src/middleware/errorHandler.js`, suppression `api/server.js`.
- Actions : mot de passe -> `${POSTGRES_PASSWORD}` lu depuis `.env` du VPS + rotation ; nginx : ne plus monter `./` (liste blanche `index.html pages css js components fav robots.txt sitemap.xml`) ; `trust proxy` ; `asyncHandler` (alias `safe`) sur toutes les routes ; `unhandledRejection` sans exit ; retirer `/stats/track` et `/stats/system` ; protéger `/health/{metrics,detailed,maintenance}` (token + `timingSafeEqual`, refus si token non défini) ; unsubscribe par jeton signé.
- Acceptation : `/docker-compose.yml` et `/database/init.sql` -> 404 ; deux IP distinctes ont des quotas distincts (supertest + `X-Forwarded-For`) ; une route qui rejette renvoie 500 JSON sans tuer le process (test) ; `git grep -i "SecurePass"` vide.

### Lot 1 — Socle API, migrations, `safe()` (1 j)
- Fichiers : `api/src/{app.js,server.js,config/env.js,lib/{safe,db,logger,errors,migrate}.js}`, `api/db/migrations/001_legacy.sql`, `scripts/check-safe.mjs`, `api/test/*`, `api/Dockerfile` (Node 20, `npm ci --omit=dev`, non-root, `/healthz`). Modules `waitlist` et `contact` portés depuis `registrations.js`/`contact.js` (`/api/v1/waitlist`, `/api/v1/contact`, anciens chemins en alias).
- `env.js` (zod) refuse de démarrer en prod sans `SESSION_SECRET`/`DATABASE_URL`.
- Acceptation : démarre sur base vide et sur base de prod existante ; `check-safe` échoue sur une route async non enveloppée ; `/healthz` indépendant de la DB ; non-régression inscription/contact.

### Lot 2 — Schéma de jeu + pipeline de contenu (1-1,5 j)
- Fichiers : `api/db/migrations/002_game_core.sql` (section 3), `data/schema/*.json`, `scripts/{validate-content,sync-content}.mjs`, `data/universes/<pilote>/` (1 univers, 3 leçons, ~30 items), `data/{quests,badges}.json`.
- Acceptation : migration rejouable sans erreur ; `validate-content` rejette des JSON invalides (tests négatifs) ; `sync-content` idempotent (2e run = 0 écriture) ; archiver un item conserve ses `attempts`.

### Lot 3 — Auth invité + compte par lien magique (1,5 j)
- Fichiers : `api/src/modules/{auth,me}/*`, `api/src/lib/{auth,mailer}.js` (middleware `attachUser`/`requireUser`, CSRF), tests.
- Acceptation : `POST /auth/guest` pose un cookie HttpOnly/Secure/SameSite=Lax, seul le hash est stocké ; lien usage unique, expire 15 min, réponse 202 identique si email inconnu ; l'upgrade conserve `user_id` ; mutation sans `X-MML` -> 403 ; rate limits IP + email ; `DELETE /me` purge tout (test cascade).

### Lot 4 — Moteur de session et réponses (2 j)
- Fichiers : `api/src/modules/{universes,sessions}/*`, `lib/{xp,grading}.js` (un correcteur par `kind`), tests.
- Acceptation : carte d'univers avec verrouillage par prérequis ; `/sessions` ne renvoie jamais `answer`/`explanation` ; `/answers` idempotent (même `Idempotency-Key` = même résultat, XP non doublé), refuse un item hors session ; XP + `leaderboard_weekly` dans la même transaction ; test de concurrence (2 réponses simultanées).

### Lot 5 — Révision espacée (1 j)
- Fichiers : `api/src/lib/srs.js` (fonction pure `nextState(state, quality, now)`), `api/src/modules/reviews/*`, tests unitaires.
- Acceptation : table de cas SM-2 (qualité 0-5 -> ease/interval/lapses attendus) ; `/reviews/due` trié par `due_at` et borné ; session `mode=review` met à jour `srs_state` ; item jamais vu créé en `state=0` à la 1re réponse.

### Lot 6 — Streaks, objectif quotidien, quêtes, badges (1,5 j)
- Fichiers : `api/src/modules/{progress,quests}/*`, `lib/{streak,week}.js` (jour local via `users.timezone`), tests.
- Acceptation : cas limites testés (changement de fuseau, minuit local, jour manqué couvert par un gel, 2 jours manqués = reset du streak sans perte d'XP) ; gel regagné 1/semaine ; quêtes jour/semaine avancent sur les événements ; badge attribué une seule fois ; `GET /progress` renvoie la carte 90 j.

### Lot 7 — Classement hebdomadaire opt-in (0,5-1 j)
- Fichiers : `api/src/modules/leaderboard/*`, purge dans la maintenance.
- Acceptation : seuls les opt-in apparaissent ; pseudos échappés (aucun HTML) et filtrés ; rang de l'utilisateur renvoyé hors top N ; plafond d'XP/jour pour le classement ; bascule de semaine UTC correcte.

### Lot 8 — Front Vite + écrans de jeu (3-4 j ; démarre après le contrat des lots 3/4 avec API mockée)
- Fichiers : `web/**`, `vite.config.js` (MPA), `web/src/{api,router,state}.js`, `web/src/screens/{home,universe,play,review,profile,leaderboard}.js`, suppression de `script.js`, `js/app.js`, `components/`, `test-components.html`.
- Règles : pas d'`innerHTML` avec des données (helper `h()` / `textContent`) ; une seule `API_BASE = '/api/v1'` ; accessibilité clavier + `prefers-reduced-motion`.
- Acceptation : parcours invité complet (arrivée -> 1re question en <= 2 clics -> fin de session -> XP/streak affichés) en test E2E ; Lighthouse mobile >= 90 perf/a11y ; aucune violation CSP en console.

### Lot 9 — Génération SEO statique (1 j ; après lot 2)
- Fichiers : `scripts/{build-seo,check-seo}.mjs`, `web/templates/*.html`.
- Acceptation : pour le pilote, `dist/univers/<slug>/<lesson>/index.html` avec JSON-LD valide, canonical, un seul h1 ; sitemap complet ; `check-seo` vert en CI ; pages de jeu `noindex`.

### Lot 10 — Image unique, CI/CD GHCR, bascule (1 j ; dépend seulement du lot 1)
- Fichiers : `Dockerfile` (multi-stage), `docker-compose.yml` (dev), `docker-compose.prod.yml`, `.github/workflows/ci-cd.yml` (remplace `deploy.yml`), `.env.example` (placeholders), suppression `nginx/` et `CI-CD-*.md`.
- Acceptation : test -> build -> push GHCR -> déploiement via `cloudflared access ssh` (aucun port 22 direct) ; `pull && up -d` sans `down` ; healthcheck vert avant fin du job ; rollback = redéployer le tag précédent ; runbook de bascule (section 6) validé ; `pg_dump` planifié.

### Lot 11 — Contenu des univers (continu, dès le lot 2)
- Fichiers : `data/universes/**` uniquement, une PR par univers/lot de leçons, validée par `validate-content`.

Dépendances : 0 -> 1 -> 2 -> 3 -> 4 -> (5, 6, 7 en parallèle) ; 8 après le contrat 3/4 ; 9 après 2 ; 10 après 1 ; 11 après 2.

---------------------------------------------------------------------------

## 8. Risques et vigilance
- Triche/farm d'XP : correction 100 % serveur, plafonds d'XP pour le classement, rate limit par `user_id`.
- Perte de progression d'un invité (cookie effacé) : proposer le lien magique après la 1re session réussie (moment de valeur), pas avant.
- Le rate limiter en mémoire n'est valable qu'avec une seule instance Node (suffisant ici ; à noter si on scale).
- Immuabilité des `key` de contenu : seul contrat durable contenu <-> progression, vérifié en CI.
