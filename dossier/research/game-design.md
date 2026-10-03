# Game design et psychologie de l'engagement — MakeMeLearn

Auteur : agent GAME DESIGN. Date : 2026-10-03. Sources web citées en fin de document. Les chiffres venant de blogs (Medium, etc.) sont de confiance moyenne : ordres de grandeur, à confirmer par nos propres A/B tests.

## 1. Principes directeurs (engagement sain vs dark patterns)

Cadre : Self-Determination Theory (autonomie, compétence, appartenance). Une mécanique est saine si elle sert l'un de ces 3 besoins et si l'élève peut l'ignorer sans pénalité grave.

| Mécanique | Version saine (adoptée) | Dark pattern (exclu) |
|---|---|---|
| Streak | Streak avec gel gratuit (2 gels/mois offerts), "jours de repos" planifiables, streak "hebdo" en option, reprise douce | Culpabilisation, mascotte qui supplie, perte brutale sans recours, gels payants agressifs |
| Notifications | 1 max/jour, heure choisie par l'élève, désactivables en 1 tap, contenu utile ("3 cartes à réviser") | Faux urgence, notifs culpabilisantes, multi-relances |
| Vies/énergie | Énergie régénérée par la **pratique de révision** (mini-révision = recharge), jamais bloquante en cours de leçon | Mur payant, punition de l'erreur, blocage pour pousser l'achat |
| Ligues | Opt-in, cohortes de 30 de niveau proche, descente protégée, pas de classement global public | Classement humiliant, ligues obligatoires |
| Récompenses variables | Variabilité sur les bonus **cosmétiques** (coffres), taux affichés, pas de loot box payante | Loot boxes payantes, near-miss, jeu de hasard |
| Boutique | Monnaie gagnée par l'apprentissage uniquement, cosmétique | Pay-to-win, monnaie premium opaque |
| Sortie | Fin de session claire ("objectif du jour atteint"), pas de scroll infini | Boucle infinie sans arrêt |

Risques documentés : effet de surjustification (la récompense externe érode la motivation intrinsèque), "gamification misuse" (grinder des leçons faciles pour protéger le streak sans apprendre), anxiété et épuisement. Contre-mesures : récompenser la **maîtrise** (XP pondérée par la difficulté et la rétention), pas le temps passé ; plafonner l'XP quotidienne utile ; afficher la progression réelle (concepts maîtrisés) à côté de l'XP ; autoriser le "mode zen" (sans streak ni ligue) ; rapport hebdo honnête ("tu as retenu 87 % des cartes à 7 jours").

Test éthique pour chaque feature : "L'élève serait-il content de savoir exactement pourquoi on a conçu ça comme ça ?" Si non, on rejette.

## 2. Boucle de jeu complète

### 2.1 Boucle cœur (30 à 90 s par "round")
Défi (question/exercice adapté) -> réponse -> feedback immédiat (correct/explication, 1 phrase) -> micro-récompense (XP, son, animation) -> question suivante. Chaque round = 1 compétence ciblée. Cible de réussite adaptative : 80 % (voir §5).

### 2.2 Boucle de session (3 à 7 min)
Une "Mission" = 8 à 12 rounds : échauffement (révision FSRS dues, 3-4 cartes) -> nouveau contenu (4-5) -> défi final/boss mini (2-3). Fin : écran de bilan (XP, précision, concepts gagnés, progression de la carte), choix : "Encore une mission" ou "Terminer". Objectif du jour atteint = cloche + streak validé.

### 2.3 Boucle quotidienne
Streak, 3 quêtes du jour (ex. "Termine 1 mission", "Révise 10 cartes", "Obtiens 90 % sur un quiz"), coffre du jour, rappel de révision. Durée cible : 5-10 min.

### 2.4 Boucle hebdomadaire
Ligue (opt-in, 7 jours), quête hebdo collective (défi d'amis/guilde), boss de la semaine.

### 2.5 Boucle méta (semaines/mois)
Progression sur la carte de l'univers : régions -> chapitres -> boss de zone ; collection (créatures/artefacts/cartes de lore) ; niveau joueur ; saison (4-6 semaines, 1 thème narratif). Maîtrise visible = "arbre de compétences" avec jauge de rétention.

### 2.6 Principe de rétention d'apprentissage
La révision espacée est **déguisée en gameplay** : les cartes "dues" sont des monstres/défis qui reviennent sur la carte ("territoires à reconquérir" si la rétention baisse). La carte se "ternit" quand R (retrievability) baisse : levier de motivation sans punition.

## 3. Système de progression

- **XP** : mesure d'effort pondéré par la qualité. Niveau joueur (cosmétique et déblocage de fonctionnalités, jamais de contenu éducatif verrouillé).
- **Maîtrise** (séparée de l'XP) : par compétence, 0 à 5 étoiles, basée sur stabilité FSRS et exactitude.
- **Ligues** : Bronze -> Argent -> Or -> Saphir -> Rubis -> Émeraude -> Obsidienne -> Diamant. Cohortes de 30, hebdo, top 5 promus, 5 derniers relégués (seulement à partir de Argent), 0 relégation pour débutants.
- **Quêtes** : 3 quotidiennes (1 facile, 1 moyenne, 1 liée à la révision), 3 hebdo, quêtes de mois (saison). Récompense : gemmes + fragments de collection.
- **Boss** : fin de chapitre. Combat = quiz de 10 à 15 questions mélangeant contenu du chapitre (60 %) et révision de chapitres précédents (40 %, effet d'interleaving). PV du boss = nb de bonnes réponses requises ; erreurs = le boss "contre-attaque" (cosmétique, pas de blocage). Échec = on peut réessayer immédiatement, sans coût, avec indices.
- **Loot/collection** : chaque univers a ~60 objets (4 raretés). Obtention : coffres de quêtes (taux publiés : commun 70 %, rare 22 %, épique 7 %, légendaire 1 %, pity timer garanti 1 rare / 5 coffres, 1 épique / 25). Doublons convertis en poussière pour fabriquer l'objet voulu (pas de frustration).
- **Énergie** (si on l'inclut) : "Souffle" 5 points ; 1 perdu par erreur *seulement lors des défis de boss*, pas dans l'apprentissage ; régénération 1 par 30 min ou en faisant une mini-révision. Jamais de paiement pour jouer ; option d'abonnement = énergie illimitée (cohérent avec le modèle Duolingo, mais on garde le cœur gratuit large). Recommandation MVP : **pas d'énergie**, ajouter seulement si besoin de rythmer.
- **Social** : amis (code d'invitation), défis 1v1 asynchrones (même 5 questions, comparer score), guildes (objectif collectif hebdo), classement d'amis plutôt que global. Messages prédéfinis uniquement (modération mineurs). Pas de chat libre au MVP.

## 4. Formules concrètes

### 4.1 XP par réponse
```
xp = base(difficulté) * mult_qualité * mult_première_fois
base = 5 + 2*d              (d = difficulté item 1..5)  -> 7..15
mult_qualité = 1.0 (correct sans indice), 0.6 (avec indice), 0 (faux) ; +0.2 si temps < médiane
mult_première_fois = 1.5 pour nouveau contenu, 1.0 pour révision (qui rapporte via "maîtrise")
bonus_mission = 20 + 5*floor(précision*10)   (précision 0..1)
plafond_XP_utile = 600/jour (au-delà : XP comptée mais plus de bonus de ligue) -> anti-grind
```
### 4.2 Niveau joueur
```
xp_pour_niveau(n) = round(100 * n^1.5)      # cumulé ; n=10 -> ~3 162 ; n=50 -> ~35 355
niveau = plus grand n tel que somme_{k<=n} xp_pour_niveau(k) <= xp_total
```
Rythme visé : niv. 5 en jour 2, niv. 10 en semaine 2, niv. 25 en mois 3 (joueur de 10 min/jour).

### 4.3 Streak
Jour validé si XP du jour >= 30 (soit une mission). Gels : 2 offerts/mois, +1 par palier 30 jours (max 3 en stock). Reprise : après rupture, "streak de retour" avec bonus x1.2 XP 3 jours. Jalons : 3, 7, 14, 30, 60, 100, 365 (récompenses cosmétiques, jamais de pression).

### 4.4 Difficulté adaptative (Elo/IRT simplifié)
```
P(correct) = 1 / (1 + 10^((d_item - θ_joueur)/400))
θ' = θ + K * (résultat - P)           K = 32 (nouveau) -> 16 (après 30 réponses)
d_item' = d_item - K_item * (résultat - P)
```
Sélection : choisir l'item dont P ~ 0.80 (fenêtre 0.70-0.88) -> zone de flow/"desirable difficulty" (Wilson et al. 2019 : ~85 % d'erreur optimal ; on vise 80 % pour la tolérance de l'UX). Si 3 échecs d'affilée : baisser de 100 points + proposer un indice ; si 5 succès d'affilée : monter de 100. Boss : P cible 0.65.

### 4.5 Répétition espacée (FSRS-style)
Retrievability : `R(t,S) = (1 + t/(9*S))^-1` (t jours depuis dernière révision, S stabilité en jours, R=0.9 quand t=S).
Intervalle : `I = 9*S*(1/R_cible - 1)` avec R_cible = 0.90 (0.85 mode "sprint", 0.95 mode "examen").
Difficulté D dans [1,10] ; notation en 4 niveaux (Again/Hard/Good/Easy) inférée des réponses de jeu : faux -> Again ; correct avec indice ou lent -> Hard ; correct -> Good ; correct rapide x3 d'affilée -> Easy.
Mise à jour D : `D' = w7*D0(3) + (1-w7)*(D - w6*(G-3))` (mean reversion). Stabilité initiale S0(G)=w[G-1].
Implémentation : librairie `ts-fsrs` (MIT) côté client/serveur, paramètres par défaut (w0..w18 de FSRS-5/6) puis optimisation par utilisateur quand >= 1000 révisions. Alternative minimale MVP : SM-2 (EF 2.5, I1=1j, I2=6j, In=I(n-1)*EF) – plus simple mais moins précis ; FSRS réduit ~20-30 % les révisions à rétention égale (benchmarks open-spaced-repetition ; confiance moyenne).
File du jour : max 20 cartes dues injectées dans la mission d'échauffement ; surplus reporté (pas de "montagne de dettes" -> évite l'effet Anki).

### 4.6 Ligue
Classement par XP hebdo plafonnée (4.1). Cohorte de 30 par tranche de niveau/ligue, constituée le lundi ; inactifs (<1 mission la semaine précédente) retirés de la ligue sans pénalité.

## 5. Flow / difficulté
Alterner : 70 % items P~0.8, 20 % faciles (P~0.95, plaisir de compétence), 10 % défis (P~0.6). Feedback < 300 ms. Après erreur : explication brève + réessai ultérieur (re-queue à +3 items). Interleaving et testing effect (récupération active) plutôt que relecture.

## 6. Onboarding (time-to-first-win)
Objectif : **< 60 s** jusqu'à la première bonne réponse, **< 3 min** jusqu'au premier "écran de victoire".
Séquence : choix de l'univers (carte visuelle, 1 tap) -> 1 question d'objectif/niveau (ou placement 5 items adaptatifs) -> première mission SANS compte -> écran de victoire (XP, premier objet) -> seulement ensuite : "sauvegarde ta progression" (compte/e-mail). Duolingo a mesuré +20 % de DAU en déplaçant l'inscription après la première leçon. Demander l'heure de rappel préférée et l'objectif quotidien (5/10/15 min) = engagement de choix (autonomie). Le notification opt-in se demande après la première victoire, pas à l'ouverture.

## 7. Notifications
Maximum 1/jour, 0 les 2 premiers jours si l'élève a déjà joué ; heure = celle choisie ; types utiles : rappel de révision ("12 cartes à 90 % de rétention aujourd'hui"), amis ("Léa t'a défié"), fin de streak (une seule, 3 h avant minuit local, désactivable séparément). Backoff : si 3 notifs ignorées -> passer à 1/semaine puis stop. Web push (service worker) + e-mail hebdo optionnel. RGPD : consentement explicite, mineurs <15 ans en France : accord parental.

## 8. Rétention : références et cibles
- Jeux mobiles (médiane) : D1 ~26 %, D7 ~10-15 %, D30 ~3-6 % ; "bon" 35/15/5 ; top quartile 40/20/10.
- Apps éducation : D1 ~22 %, D7 ~10 %, D30 ~2-3 % (AppsFlyer) ; Duolingo bien au-dessus grâce au streak.
- Cibles MakeMeLearn (web, communauté d'autodidactes) : D1 35 %, D7 18 %, D30 8 % à 6 mois ; indicateurs d'apprentissage en parallèle (rétention des cartes à 7 jours >= 80 %) pour ne pas optimiser l'engagement seul. Suivre aussi : time-to-first-win, missions/jour/actif, % objectif du jour, taux d'opt-out des notifs.

## 9. Modèle de données (Postgres)

```sql
universes(id, slug, name, theme_json, palette_json, mascot_id, status)
regions(id, universe_id, slug, name, order_idx, map_x, map_y)
chapters(id, region_id, title, order_idx, boss_id)
skills(id, chapter_id, title, prereq_skill_ids int[])
items(id, skill_id, type, payload_json, difficulty_elo real, n_answers int, locale)
-- joueurs
users(id, handle, email null, birth_year, locale, created_at, mode ('normal'|'zen'))
user_universe(user_id, universe_id, xp, level, started_at, daily_goal_min)
user_skill(user_id, skill_id, mastery_stars smallint, theta real)
-- répétition espacée (FSRS)
cards(user_id, item_id, stability real, difficulty real, due_at, last_review, reps int, lapses int, state smallint)
review_log(id, user_id, item_id, rating smallint, elapsed_days real, ms int, ts, hint bool)
-- jeu
sessions(id, user_id, universe_id, started_at, ended_at, xp_gained, accuracy real)
streaks(user_id, current int, best int, last_day date, freezes int)
quests(id, scope ('daily'|'weekly'|'season'), rule_json, reward_json)
user_quests(user_id, quest_id, date, progress, claimed)
leagues(id, week_start, tier); league_members(league_id, user_id, weekly_xp, rank)
collectibles(id, universe_id, rarity, name, lore, art_ref)
inventory(user_id, collectible_id, qty); chest_pity(user_id, since_rare, since_epic)
bosses(id, chapter_id, hp, item_pool_json, rules_json)
friends(user_id, friend_id, status); challenges(id, from_id, to_id, item_ids int[], scores_json)
notif_prefs(user_id, hour, channels, last_sent, ignored_count)
events(id, user_id, name, props_json, ts)   -- analytics (consentement)
```
API Express 4 : rappel CLAUDE.md, envelopper chaque route async dans un `safe()` try/catch. Le serveur est autoritaire pour XP/streak/loot (anti-triche), le client fait l'optimiste UI.

## 10. Design d'univers réutilisable

Un univers = un **paquet de données** (JSON + assets), pas du code. Même moteur, identité distincte.

```json
{
 "slug":"cosmos-code","name":"Cosmos Code","subject":"programmation",
 "pitch":"Réparer une station spatiale en apprenant à coder",
 "palette":{"bg":"#0b1026","primary":"#7c5cff","accent":"#ffd166","ok":"#3ddc97","ko":"#ff6b6b"},
 "type":{"title":"Space Grotesk","body":"Inter"},
 "mascot":{"name":"Bip","voice":"curieux, encourageant","states":["idle","cheer","think","sleep"]},
 "map":{"style":"constellation","regions":[{"name":"Atelier","x":10,"y":60}]},
 "currency":{"soft":"Cristaux","hard":null},
 "chest":"Capsule","boss_theme":"Anomalies (bugs)",
 "sfx_pack":"synth-soft","tone":"tutoiement, humour léger",
 "lore_seed":"…","season_arcs":["La Panne Mère","L'Essaim"]
}
```
Éléments d'identité obligatoires : (1) métaphore de progression distincte (carte, arbre, ville à bâtir, expédition) ; (2) mascotte + 4 émotions ; (3) palette + typo + pack sons ; (4) ennemis/boss thématiques (l'erreur = adversaire amusant, jamais l'élève) ; (5) vocabulaire des monnaies et coffres ; (6) lore et saisons ; (7) collection thématique. Exemples : Histoire -> "Machine à remonter le temps", carte = frise ; Langues -> "Archipel des mots", îles = thèmes ; Maths -> "Donjon des nombres", cartes = salles ; Sciences -> "Laboratoire vivant", collection = spécimens ; Culture générale -> "Musée infini". Thème graphique via variables CSS (`--primary`...) chargées depuis `palette`, compatible avec la landing statique. Contenu fourni par une communauté (autodidactes) : format d'items standard (QCM, saisie, appariement, ordre, cloze), validation par pairs, version et licence par univers.

## 11. Roadmap MVP (ordre recommandé)
1. Boucle mission + XP + feedback + onboarding sans compte (1 univers pilote).
2. Cartes FSRS (ts-fsrs) + file de révision.
3. Streak + gels + 3 quêtes + notifs web push opt-in.
4. Carte/boss + collection + coffres avec pity.
5. Amis + défis asynchrones ; 6. Ligues opt-in ; 7. Univers 2 pour valider la réutilisabilité ; 8. Saisons.
A/B tests à prévoir : seuil streak (30 vs 50 XP), objectif quotidien par défaut, position de l'inscription, heure de notif.

## Sources
- Duolingo (streaks, ligues, DAU 5 M -> 40 M, retention) : https://medium.com/@theniteshknows/how-duolingo-reignited-user-growth-a-masterclass-in-gamification-strategy-2bc2d40e1876 ; https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo ; https://vmobify.com/blog/how-duolingo-grew
- Onboarding Duolingo (première leçon avant inscription, +20 % DAU) : https://relaunch.ai/blog/duolingo-onboarding-teardown-7-b-tests-behind-their-9-conver.html ; https://goodux.appcues.com/blog/duolingo-user-onboarding
- Duolingo Energy (2025) : https://www.classcentral.com/report/duolingo-breaks-hearts-for-energy/ ; https://duoplanet.com/duolingo-energy-system/
- FSRS (formules R, S, D, intervalle) : https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm ; https://borretti.me/article/implementing-fsrs-in-100-lines ; https://open-spaced-repetition.github.io/ts-fsrs/classes/FSRS.html
- Benchmarks rétention : https://blog.playio.co/d1-d7-d30-retention-benchmarks-2026 ; https://appfollow.io/blog/mobile-game-retention ; https://www.core-mba.pro/tool-hub/mobile-app-retention
- SDT / surjustification / dark patterns : https://selfdeterminationtheory.org/wp-content/uploads/2020/10/2018_RutledgeWalshEtAl_Gamification.pdf ; https://arxiv.org/pdf/2203.16175 (gamification misuse, Duolingo) ; https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point ; https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12913498/
- Zone d'apprentissage optimale ~85 % : Wilson, Shenhav, Straccia, Cohen (2019), Nature Communications, "The Eighty Five Percent Rule" (cité de mémoire, non re-vérifié ici).
- Note : sous-agents non lancés (budget) ; recherche menée en direct. Points à approfondir : paramètres FSRS-6, économie de boutique, A/B de notifications.
