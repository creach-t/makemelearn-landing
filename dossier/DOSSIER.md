# Dossier de lancement — MakeMeLearn, jeu d'apprentissage multi-univers

Synthèse des 4 recherches (`research/`) et de la mémoire commune (`memory/`). Statut : **dossier complet côté recherche, 5 points propriétaire à valider avant le code**.

## 1. Vision
Un jeu d'apprentissage francophone, gratuit, multi-univers (chaque univers = thème, lore, mascotte, carte de compétences), sur un moteur commun. Engagement fort mais sain : pas de dark patterns.
Positionnement : aucun acteur FR n'occupe le multi-univers hors langues (seo-marche).

## 2. Décisions de synthèse (conflits entre agents tranchés)
| Sujet | Décision | Pourquoi |
|---|---|---|
| Répétition espacée | **FSRS** (`ts-fsrs`), rétention cible 0,90, max 20 révisions dues/jour | game-design propose FSRS, architecture SM-2 : FSRS est plus efficace ; adapter la table `srs_state` (stability, difficulty, due) |
| Vies / énergie | **Pas de vies globales** ; seulement 3 vies sur les boss, sans minuteur | architecture + univers : pas de frustration artificielle ; cohérent avec « sans culpabilisation » |
| Streak | Validé à 30 XP/jour, **gel gratuit automatique 1/semaine** | convergence des 3 agents |
| Notifications | Max 1/jour, demandées après la première victoire | game-design |
| Social | Classement hebdo **opt-in**, défis entre amis | idem |
| Front | Vanilla JS modules ES + **Vite MPA** | build nécessaire (hash, CSP, SEO) |
| SEO leçons | **Pré-rendu statique** depuis les JSON de contenu, jeu sous `/app/` en noindex | seo-marche + architecture |
| Backend | Un conteneur Express (sert `dist/` + `/api/v1`) + Postgres sidecar, `safe()` sur toutes les routes async | pattern VPS + gotcha Express 4 |
| Auth | Invité anonyme (cookie HttpOnly, hash du jeton) → compte par lien magique, même `user_id` ; première mission avant inscription | game-design + architecture |
| Contenu | JSON versionné `data/universes/<slug>/`, solutions jamais envoyées au client avant réponse | architecture |
| Univers pilote | **Le Bureau des Doutes** (esprit critique), 3 chapitres, 30 items | pas de moteur code, SEO fort, partageable |
| Monétisation v1 | 100 % gratuit, pas de mur payant | simplicité, à confirmer |

## 3. Univers (ordre de lancement)
1. Le Bureau des Doutes (pilote, prêt : `research/univers/bureau-des-doutes/`)
2. La Cité des Algorithmes (Python, exige exécution `code` Pyodide)
3. L'Atelier des Petits Sous (finances, risque YMYL : validation experte)
4. L'Archipel des Langues, 5. Les Chroniques du Cosmos (échantillons seulement)

## 4. Roadmap d'implémentation (lots de `research/architecture.md` §7)
0 correctifs sécurité → 1 socle API → 2 schéma + contenu → 3 auth → 4 sessions de jeu → 5 SRS → 6 streaks/quêtes → 7 classement → 8 front → 9 SEO → 10 CI/CD + bascule → 11 contenu.

## 5. Alertes à traiter en priorité
- **Sécurité (lot 0)** : nginx sert probablement tout le dépôt (`/docker-compose.yml`, `/database/init.sql`). Mot de passe Postgres en clair dans le compose, `.env.example` et l'historique git : rotation nécessaire. `/stats/system` accepte n'importe quel Bearer. Pas de `trust proxy`.
- **Faits à re-vérifier avant publication** : plafond du Livret A, chiffres NASA (écrits de mémoire), calculs du chapitre 3 à refaire par script. Volumes de recherche FR : estimations non vérifiées (Keyword Planner / Search Console). Chiffres Duolingo/rétention : blogs, confiance moyenne. Rich results Google Course/FAQ retirés : à recouper avec la doc officielle.
- **Incohérence de spec** : champs du type `code` (`code_initial`/`solution_modele` vs `code_depart`/`solution`).

## 6. Checklist « dossier complet »
- [x] Étude marché et concurrents
- [x] Stratégie SEO (URLs, balisage, CWV, maillage)
- [x] Game design (boucles, formules, éthique, rétention)
- [x] Architecture, schéma SQL, contrat API, lots
- [x] Format de contenu + univers pilote + relecture qualité
- [~] Faits sensibles vérifiés (voir §5)
- [ ] Décisions propriétaire (§7)
- [ ] Validation légale mineurs <15 ans / RGPD / cookies CNIL
- [ ] Illustrations des personnages et image OG

## 7. À trancher par toi (bloquant pour certains lots)
1. `curl -I https://makemelearn.fr/docker-compose.yml` : 200 ou non ? (si 200, rotation immédiate du mot de passe DB)
2. Postgres : sidecar dans le compose (recommandé) ou partagé ? Conserver la table `registrations` de prod ?
3. Fournir le `ci-cd.yml` modèle (`modern-cv-react` ou Cashly) : requis pour le lot 10.
4. Expéditeur / SMTP du lien magique, SPF/DKIM configurés ?
5. Mineurs <15 ans : mode sans compte ou compte parental ? Licence du contenu (CC BY-NC-SA ?) ? FR uniquement en v1 ?

Lots 0 à 3 peuvent démarrer sans ces réponses (sauf 1 pour la partie sécurité de prod).

## 8. Décisions propriétaire (2026-10-03)
1. **Postgres sidecar** dans le compose du projet, volume existant conservé, table `registrations` conservée (migration 001 no-op, `pg_dump` avant bascule).
2. **CI/CD modèle** : `creach-t/atelier-creatif-dashboard/.github/workflows/ci-cd.yml` (récupéré via GitHub) : test → build/push GHCR → deploy via cloudflared 2026.5.1 épinglé, healthcheck + rollback. Lot 10 s'en inspire ; seuls le sous-domaine et `VPS_DEPLOY_PATH` changent.
3. **Lien magique** : SMTP générique via nodemailer (déjà en dépendance), expéditeur `no-reply@makemelearn.fr`, identifiants SMTP en `.env` sur le VPS uniquement (fournisseur suggéré : Brevo, offre gratuite ; SPF/DKIM à configurer). En dev : le lien est loggé en console.
4. **Mineurs** : le jeu complet est jouable en invité sans aucune donnée personnelle. La création de compte (e-mail) exige une déclaration d'âge ≥ 15 ans ; en dessous, l'utilisateur reste invité (progression anonyme). **Licence** : contenu CC BY-NC-SA 4.0, code MIT. **FR uniquement** en v1.
