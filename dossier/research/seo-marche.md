# SEO / Marché — MakeMeLearn (jeu d'apprentissage multi-univers FR)
Date : 2026-10-03. Méthode : recherches web faites en direct (sous-agents non lancés, recherches courtes). WebSearch ne fournit PAS de volumes de recherche : tout volume ci-dessous est un ordre de grandeur estimé, confiance FAIBLE, à valider (Google Keyword Planner, Search Console, Semrush).

## 1. Concurrents et mécaniques
| Acteur | Mécaniques clés | Enseignement pour MML | Source / confiance |
|---|---|---|---|
| Duolingo | Streaks (+Streak Freeze), XP, ligues (10 tiers, groupes de 30, reset hebdo), gems, hearts, objectifs quotidiens | Streak = levier de rétention n°1 (streak 7j : 3,6x plus d'engagement ; Freeze : -21% de churn ; ligues : +17% de temps d'apprentissage). Gems : 72% jamais dépensés -> économie sans valeur perçue | strivecloud.io, duolingo.deconstructoroffun.com, lennysnewsletter.com / moyenne (seconde main) |
| Brilliant | Gamification sobre : streaks, XP, boucle essai-feedback-correction | Qualité pédagogique avant le décor ; adapté maths/sciences/logique | trophy.so (case study Brilliant) / moyenne |
| Mimo | Clone Duolingo pour le code : leçons 5-10 min, streaks, XP | Valide le modèle micro-leçons pour le code | coddy.tech/vs/mimo / moyenne |
| Boot.dev | RPG : XP, niveaux, ligues hebdo, guildes, boss fights communautaires, coffres (15 réussites d'affilée), gems, quêtes quotidiennes | Narration RPG + social pour public technique ; récompense la maîtrise | boot.dev/blog, classcentral.com / bonne |
| Kahoot | Quiz live multi-joueurs type jeu télé, usage scolaire | Mode défi à plusieurs / salle, viral en classe | techpoint.africa, scholarly.so / moyenne |
| Anki | Répétition espacée (FSRS depuis v23.10), gratuit, UX austère | SRS en coulisse ; l'UX est son point faible | wikipedia Anki / bonne |
| Quizlet | 60M+ utilisateurs (2024), énorme bibliothèque de decks, plus de SRS depuis 2020 | Contenu communautaire = SEO massif | techpoint.africa / moyenne |
| FR : Gymglish (5-6M users, par e-mail), MosaLingua (SRS), Babbel, Busuu, Lumni (audiovisuel public, scolaire gratuit) | Narration/humour (Gymglish), SRS (Mosa) | Aucun acteur FR n'occupe le "jeu multi-univers hors langues" : espace libre. Lumni = concurrent gratuit scolaire | maddyness, universal-languages.fr, wikipedia Lumni / moyenne |

Marché : edtech FR estimé à 8,8 Md$ en 2025 (sources agrégateurs, fiabilité faible) ; l'apprentissage gamifié est présenté comme modalité dominante (à prendre avec prudence).
Constat : Duolingo écrase les langues. Espace moins occupé : multi-univers (cuisine, finance perso, culture G, musique) avec boucle quotidienne et communauté d'autodidactes (positionnement actuel de makemelearn.fr).

## 2. Intentions de recherche FR par thème (volumes estimés, non vérifiés)
Trois couches : (a) "apprendre X" (forte concurrence), (b) "quiz / test / exercices X gratuit" (intention jeu, très alignée), (c) longue traîne par leçon.
| Thème | Requêtes à tester | Ordre de grandeur | Concurrence FR |
|---|---|---|---|
| Langues | apprendre l'anglais gratuit, test de niveau anglais, quiz vocabulaire espagnol, conjugaison exercices | très élevé (têtes 10k-100k+) | très forte |
| Code | apprendre à coder gratuit, apprendre python, quiz javascript, exercices SQL | élevé (5k-50k) | forte (OpenClassrooms, Grafikart, W3Schools, Codecademy) |
| Maths | exercices maths 6e/3e/seconde, calcul mental jeu, tables de multiplication | très élevé, saisonnier (rentrée) | forte (Lumni, Prof en poche...) |
| Culture générale | quiz culture générale, quiz capitales, test culture générale | élevé (10k-100k têtes) | forte mais qualité souvent faible : opportunité |
| Cuisine | apprendre à cuisiner, techniques de base, quiz cuisson | élevé, mais recettes captées par Marmiton/750g | forte côté recettes, faible côté apprendre/quiz |
| Musique | apprendre le solfège, piano débutant, quiz notes, entraînement oreille | moyen-élevé | moyenne |
| Finance perso | éducation financière, apprendre à investir, quiz budget/bourse, comprendre ETF | moyen-élevé, croissant | moyenne ; YMYL, exigence E-E-A-T |
| Autres | code de la route (test), histoire-géo, échecs, logique | code de la route : énorme | forte, spécialisée |

## 3. Architecture SEO
### URLs
- `/` ; `/univers/` (hub) ; `/univers/<univers>/` ; `/univers/<univers>/<parcours>/` ; `/univers/<univers>/<parcours>/<lecon-slug>/` (indexable : explication + mini-quiz jouable + FAQ)
- `/quiz/<theme>/<slug>/` (quiz autonomes, culture G) ; `/glossaire/<terme>/` ; `/blog/` (intentions "comment apprendre X")
- Slugs FR sans accents, stables, 3 niveaux max, canonical sur chaque page. Progression/compte/état de jeu sous `/app/` en noindex, jamais de paramètres d'état dans les URLs indexables.
### Indexation et qualité
Le jeu (boucle quotidienne) tourne en JS ; chaque leçon a une version HTML lisible sans JS (texte, exemples, 3-5 questions visibles). Google évalue la qualité au niveau domaine depuis mars 2024 (helpful content intégré au core) : pas de milliers de pages génériques ; noindex des variantes sans demande, sitemap limité aux URLs voulues (airops.com, seohandbook.co.uk, blogseo.io / confiance moyenne). Départ : 3-6 univers x 5-10 leçons riches.
### Schema.org (état 2026)
- Google a retiré le rich result Course Info (juin 2025) et les rich results FAQ (7 mai 2026) ; Course et FAQPage restent valides en schema.org sans gain visuel garanti (searchenginejournal.com, relevantaudience.com, getpassionfruit.com / moyenne ; vérifier developers.google.com/search). Le chiffre "3,2x plus d'AI Overviews avec FAQPage" vient d'un blog marketing : confiance faible.
- À poser : BreadcrumbList (rich result actif), Organization + WebSite, Article (blog), Course + Quiz + FAQPage en balisage léger pour la compréhension/extraction IA, sans en attendre un rich result. Valider avec validator.schema.org.
### Core Web Vitals
Seuils "bon" au 75e percentile : LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1 (eginnovations.com et autres / bonne). Pour MML : HTML pré-rendu, CSS critique inline, 1-2 polices woff2 préchargées (ou système), images AVIF/WebP avec width/height (CLS), JS du jeu en defer et découpé par univers, animations CSS (transform/opacity), brotli + cache immutable sur assets hashés via Traefik, Cloudflare déjà devant. Mesure : CrUX / PageSpeed / Search Console.
### Maillage
Hub univers -> parcours -> leçons ; leçon -> précédente/suivante + 2-3 leçons liées (autres parcours du même univers) ; leçon -> glossaire ; blog -> hubs/leçons en ancres descriptives ; fil d'Ariane partout ; passerelles inter-univers (finance <-> maths). Sitemap par univers avec lastmod réel ; <= 3 clics depuis la home.

## 4. Les 6 univers les plus prometteurs
Critères : demande FR, concurrence "jeu/quiz", fit boucle quotidienne/micro-leçons, monétisation, risque (YMYL, droits).
1. **Code / dev** : forte demande, proche de la communauté autodidacte MML, modèle Mimo/Boot.dev prouvé, correction automatisable.
2. **Culture générale / quiz** : gros volumes, concurrence de faible qualité, très partageable, contenu peu coûteux : moteur d'acquisition SEO.
3. **Langues (par niches)** : plus gros marché mais Duolingo écrasant ; entrer par anglais pro/tech, vocabulaire thématique, conjugaison FR plutôt que "apprendre l'anglais".
4. **Maths / calcul mental** : volume élevé saisonnier, exercices auto-corrigés idéaux pour le jeu ; contourner Lumni par l'angle ludique.
5. **Finance perso** : demande croissante, peu de jeux FR, public adulte solvable ; attention YMYL (sources, disclaimers, pas de conseil personnalisé).
6. **Cuisine ou Musique** : cuisine = large audience (angle techniques/quiz, pas recettes) ; musique = faible concurrence ludique FR mais audio requis. À départager par Keyword Planner.
Confiance du classement : moyenne-faible (qualitatif, volumes non mesurés).

## 5. Mécaniques recommandées (engagement sain)
Streak avec freeze/jour de repos intégré, ligues optionnelles en petits groupes, économie de gems avec usages réels (corrige le défaut Duolingo), défis/boss communautaires façon Boot.dev, SRS invisible, pas de hearts punitifs, suivi D1/D7/D30 (cliff D7 de Duolingo 45% -> 22% selon blogs, confiance faible).

## 6. Limites et prochaines étapes
Pas de volumes réels ; chiffres Duolingo de seconde main ; état des structured data via presse SEO. Suite : Keyword Planner sur ~100 requêtes, audit SERP manuel des 6 univers, prototype d'une page leçon avec CWV mesurés.
