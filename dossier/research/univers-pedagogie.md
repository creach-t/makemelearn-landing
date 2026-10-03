# MakeMeLearn — Univers, pédagogie, contenu

Agent UNIVERS / PÉDAGOGIE / CONTENU. Livrable v1. Fichiers annexes : `dossier/research/univers/` (SPEC-FORMAT.md, bureau-des-doutes/chapitre-{1,2,3}.json, echantillons-autres-univers.json, REVUE-QUALITE.md).

## 1. Format de contenu d'un « univers » (v1.0)

### 1.1 Principes
- Contenu = fichiers texte versionnés dans git (`content/<slug>/`), relus en PR comme du code. Le moteur (API Express/Postgres) importe/valide via JSON Schema ; la base n'est pas la source de vérité éditoriale.
- Un univers = 1 dossier : `universe.json` (méta+lore+personnages+quêtes), `skills.json` (graphe), `chapters/cNN-slug/chapter.json` + `lessons/lNN.json` (items), `bosses/`, `assets/`.
- Versionnement : `schema_version` (format, semver) + `content_version` (semver de l'univers) ; chaque item a un `id` immuable ; une modification de sens = nouvel item + `remplace: "<ancien id>"` (on garde la stat de progression/répétition espacée).
- Markdown limité dans les textes (gras, italique, code inline) ; pas de HTML. Tout texte porte `lang: fr` implicitement.

### 1.2 `universe.json` (exemple condensé)
```json
{
  "schema_version": "1.0.0", "content_version": "0.1.0",
  "id": "bdd", "slug": "bureau-des-doutes", "statut": "brouillon|relecture|publie",
  "seo": {
    "title": "Esprit critique : apprendre à ne plus se faire avoir | MakeMeLearn",
    "meta_description": "Biais cognitifs, fake news, statistiques trompeuses : mène l'enquête en 3 min par jour. Gratuit, sans pub.",
    "slug_url": "/univers/esprit-critique", "mots_cles": ["esprit critique","biais cognitifs","fake news"],
    "og_image": "assets/og.png", "schema_org": "Course", "canonical": "https://makemelearn.fr/univers/esprit-critique"
  },
  "pitch": {"promesse": "...", "public": "...", "niveau": "débutant", "duree_totale_h": 6, "prerequis": []},
  "lore": {"accroche": "...", "monde": "...", "ton": "polar malicieux, tutoiement"},
  "personnages": [{"id":"mirabelle","nom":"...","role":"mentor","bio":"...","voix":"...","avatar":"assets/mirabelle.svg"}],
  "chapitres": ["c01-raccourcis","c02-sources","c03-chiffres"],
  "quetes": [{"id":"q.quotidienne","type":"quotidienne","objectif":"1 leçon","recompense":{"xp":20}}],
  "recompenses": {"xp_par_item": 5, "xp_boss": 50, "badges": [{"id":"b.premier-indice","condition":"1ère leçon"}]},
  "legal": {"auteurs":["..."],"relecteur":"...","date_revue":"2026-10-03","licence_contenu":"CC BY-NC-SA 4.0 (à valider)","sources_globales":["..."]}
}
```

### 1.3 `skills.json` — carte de compétences (graphe de prérequis, DAG)
```json
{"competences":[
 {"id":"bdd.biais.confirmation","nom":"Repérer le biais de confirmation","chapitre":"c01","prerequis":[],"niveaux_maitrise":["vu","pratique","maitrise"],"seuil_maitrise":{"items_reussis":6,"sur":8,"espacement_jours":2}},
 {"id":"bdd.sources.lecture_laterale","prerequis":["bdd.sources.primaire_secondaire"]}
]}
```
Règles : graphe acyclique (validé en CI), chaque compétence a ≥ 6 items (dont ≥ 3 types), une compétence est « maîtrisée » après réussites espacées (révision à J+1, J+3, J+7, J+21), une compétence se débloque quand tous ses prérequis sont ≥ « pratique ». Le graphe est affiché comme carte (le « plan d'enquête »), pas comme liste forcée : plusieurs branches ouvertes en parallèle.

### 1.4 Leçon (2-3 min)
```json
{"id":"bdd.c1.l1","titre":"Pourquoi on ne voit que ce qui nous arrange","competences":["bdd.biais.confirmation"],
 "duree_min":3,"intro":{"personnage":"mirabelle","texte":"2 phrases max de mise en situation"},
 "micro_cours":"<= 60 mots, 1 idée, 1 exemple",
 "items":[ ... 4 à 6 items ... ],
 "recap":"1 phrase à retenir","flashcards_generees":["bdd.c1.l1.i04"]}
```
Contraintes : 1 idée par leçon ; 4-6 items ; progression facile → moyen ; dernier item = transfert (situation neuve) ; fin de leçon toujours « propre » (pas de cliffhanger artificiel).

### 1.5 Types d'exercices (champs spécifiques)
| type | champs | correction | note UX |
|---|---|---|---|
| `qcm` | `choix[{id,texte,distracteur_pourquoi}]` (3-4), `bonne` | exact | ordre des choix mélangé |
| `vrai_faux` | `affirmation`, `reponse` | exact | éviter les négations |
| `trous` | `texte` avec `{{1}}`, `trous[{id,reponses_acceptees,banque}]` | tolérante (casse/accents) | banque de mots = mode facile |
| `appariement` | `paires[{gauche,droite}]` (4-5) | 1-1 | tap-tap ou glisser |
| `ordre` | `elements` dans l'ordre correct, `critere_ordre` | exact | remise en ordre chronologique/logique |
| `saisie` | `reponses_acceptees`, `normalisation`, `reponse_modele` | normalisée ; numérique avec variantes | jamais de réponse ouverte non corrigeable |
| `code` | `langage`, `code_depart`, `tests[{entree,sortie_attendue}]`, `solution` | exécution sandbox (Pyodide/WASM côté client, jamais d'exécution serveur arbitraire) | limite temps/mémoire |
| `flashcard` | `recto`, `verso`, `mnemo` | auto-évaluation 4 niveaux (à revoir/difficile/bien/facile) → répétition espacée | générées depuis les leçons |

Champs communs : `id, type, competence, difficulte(1-5), consigne, enonce, feedback_ok, feedback_ko, indice, sources, duree_s, remplace, statut_qa`.

### 1.6 Boss
`boss` = épreuve de fin de chapitre : 8-10 items tirés (aléatoirement mais équilibrés par compétence) d'un pool de ≥ 20 items, 3 « vies » (cœurs) restaurables, seuil 70 %, **sans minuteur punitif** ; narration (personnage antagoniste « le Maître du Prisme ») ; échec = on reçoit un « dossier de révision » ciblé sur les compétences ratées, nouvelle tentative immédiate possible. Récompense : badge, XP, déblocage chapitre suivant, carte à collectionner (lore).
```json
{"id":"bdd.c1.boss","titre":"Face au Maître du Prisme","pool_items":["bdd.c1.*"],"nb_items":9,"vies":3,"seuil":0.7,"narration_avant":"...","narration_victoire":"...","narration_defaite":"...","recompenses":{"xp":50,"badge":"b.prisme-brise"}}
```

### 1.7 Quêtes
Types : `quotidienne` (1 leçon, streak doux avec « gel » gratuit), `hebdo` (3 compétences revues), `histoire` (arc narratif sur un chapitre), `defi_ami` (opt-in), `maitrise` (rejouer des items oubliés). Aucune quête ne repose sur la peur de perdre (pas de perte d'XP, streak jamais reset sans gel ni message culpabilisant).

### 1.8 Critères de qualité d'un item (grille notée, 12 points, ≥ 10 pour publier, 0 sur un critère bloquant = rejet)
1. (bloquant) UNE seule bonne réponse défendable. 2. (bloquant) Fait exact et sourcé. 3. Consigne claire en 1 lecture (≤ 140 car.). 4. Test d'unité cognitive : une seule notion évaluée. 5. Distracteurs plausibles = vraies erreurs courantes, chacun avec `distracteur_pourquoi`. 6. Pas d'indice dans la forme (réponse la plus longue, « toutes les réponses… », parallélisme grammatical). 7. Pas de négation piégeuse ni de double négation. 8. Feedback_ok explique le pourquoi ; feedback_ko démonte l'erreur et renvoie à la compétence. 9. Niveau de difficulté cohérent avec la compétence. 10. Français correct, inclusif sans lourdeur, ton de l'univers. 11. Accessibilité : pas d'info portée par la couleur seule, alt text des images, lisible en lecteur d'écran. 12. Non-biaisé/neutre (pas de politique partisane, pas de stéréotype), cas fictifs signalés.
Process : rédaction → relecture croisée (autre humain/agent) → test sur 5 apprenants → suivi post-publication (taux de réussite attendu 55-85 % ; < 30 % ou > 95 % = item à revoir ; item « trompeur » si les meilleurs apprenants échouent plus que les débutants).

## 2. Cinq univers originaux

| # | Univers | Thème / ton | Public | Promesse | 1ers chapitres |
|---|---|---|---|---|---|
| 1 | **Le Bureau des Doutes** (`bdd`) | Esprit critique, biais, fake news, statistiques ; polar malicieux, agence de détectives du doute | Ados 15+ à adultes curieux, enseignants | « En 3 min par jour, deviens quelqu'un qu'on n'arnaque plus. » | Les raccourcis du cerveau ; Enquête sur les sources ; Les chiffres qui mentent |
| 2 | **La Cité des Algorithmes** (`cda`) | Python/logique débutant ; cyberpunk-humour, tu hackes une ville joyeusement kitsch | Reconversion, lycéens, autodidactes | « Écris ton premier programme utile en 2 semaines, sans rien installer. » | Variables (petites boîtes) ; Conditions ; Boucles |
| 3 | **L'Atelier des Petits Sous** (`atp`) | Finances perso (budget, épargne, intérêts composés, impôts de base France) ; atelier d'artisan chaleureux | 18-30 ans, premiers salaires | « Comprendre où va ton argent, sans jargon ni vente de produits. » | Le budget 50/30/20 ; Épargne et livrets ; Intérêts composés |
| 4 | **L'Archipel des Langues** (`arl`) | Anglais B1 pro (emails, réunions, téléphone) ; aventure d'îles | Salariés, étudiants | « Écrire et comprendre l'anglais du travail sans stress. » | L'île des emails ; La baie des réunions ; Le phare du téléphone |
| 5 | **Les Chroniques du Cosmos** (`cdc`) | Astronomie accessible (échelles, saisons, gravité, étoiles) ; conte de veillée, voix douce | Familles, curieux, collégiens | « Remets l'univers à ta taille : 5 idées qui changent ton ciel. » | Les échelles ; Pourquoi des saisons ; La gravité |

Choix du pilote : **Le Bureau des Doutes**. Raisons : (1) demande SEO forte et durable (« esprit critique », « biais cognitifs », « fake news ») et angle citoyen/éducation nationale (EMI) ; (2) 100 % faisable sans moteur spécial (pas de sandbox de code) → on valide la boucle d'engagement et le format tout de suite ; (3) fort potentiel viral/partage (« j'ai repéré le biais ») ; (4) fits la communauté d'autodidactes de makemelearn ; (5) contenu intemporel, peu de risque de péremption, items vérifiables ; (6) la Cité des Algorithmes est le 2e (nécessite l'exécution de code côté client).

## 3. Univers pilote : Le Bureau des Doutes

### 3.1 Fiche
- **Lore** : Dans la ville de Brumelune, tout se murmure et rien ne se vérifie. L'Agence du Doute, minuscule bureau au-dessus d'une boulangerie, recrute des « stagiaires de l'évidence » : tu fais les enquêtes que personne n'ose faire. Ennemi récurrent : **le Maître du Prisme**, collectionneur de lunettes déformantes qui fait voir à chacun ce qu'il veut croire.
- **Personnages** : *Inspectrice Mirabelle Doute* (mentor, sèche, bienveillante, phrase fétiche « Qu'est-ce qui te prouve ça ? ») ; *Pie* (sidekick, pie voleuse de certitudes, apporte les cas) ; *Le Maître du Prisme* (boss ch.1) ; *Madame Rumeur* (boss ch.2, colporteuse) ; *Le Statisticien Fantôme* (boss ch.3).
- **Ton** : tutoiement, humour sec, jamais moqueur envers les gens qui se trompent ; on se trompe tous (c'est le message). Neutralité politique stricte ; aucun cas réel polarisant.
- **Chapitres** : c1 Les raccourcis du cerveau (5 compétences), c2 Enquête sur les sources (5), c3 Les chiffres qui mentent (5). Durée ≈ 2 h pour les 3 chapitres. Chapitres suivants prévus : Arguments et sophismes ; Science et preuves ; Soi-même, premier suspect.
- **Carte de compétences (extrait)** : `biais.confirmation → biais.ancrage → biais.survivant` ; `biais.halo` indépendant ; `sources.primaire_secondaire → sources.lecture_laterale → sources.image_inversee` ; `chiffres.moyenne_mediane → chiffres.relatif_absolu → chiffres.taux_de_base` ; `chiffres.correlation_causalite` dépend de `biais.confirmation` ; boss c3 requiert tout c1 + c2 au niveau « pratique ».
- **Quêtes** : « Le stagiaire du jour » (1 leçon/jour, gel de streak offert), « Dossier de la semaine » (revoir 3 compétences), « L'affaire du chapitre » (arc narratif), « Contre-enquête » (défi à partager : un cas de la vie réelle repéré par l'apprenant, sans exposer de données perso).
- **SEO** : page univers `/univers/esprit-critique` ; title ≤ 60 car., description ≤ 155 car. ; H1 unique ; pages leçon indexables en aperçu (1 leçon gratuite sans compte) ; pages « glossaire » (biais de confirmation, effet d'ancrage…) en longue traîne ; schema.org `Course` + `FAQPage`.

### 3.2 Les 30 items
Voir les trois fichiers JSON (validés, format §1.5) :
`dossier/research/univers/bureau-des-doutes/chapitre-1.json` (10 items), `chapitre-2.json` (10), `chapitre-3.json` (10). Un échantillon de 12 items pour les 4 autres univers est dans `dossier/research/univers/echantillons-autres-univers.json`. Le rapport de relecture qualité figure dans `dossier/research/univers/REVUE-QUALITE.md`.

Revue qualité : 18 items sur 42 corrigés (réponses soufflées dans l énoncé, distracteurs ambigus, sources vagues) ; faits et calculs exacts. Types observés : le type `code` a été utilisé dans les échantillons avec les champs `langage, code_initial, tests, solution_modele` (à aligner sur §1.5 : `code_depart`/`solution`). À revérifier avant publication : plafond Livret A et chiffres NASA des échantillons atp/cdc (non vérifiés en ligne).

### Index des 30 items
- `bdd.c1.l1.i01` [flashcard, d1] Retourne la carte : que dit l'inspectrice Mirabelle du biais de confirmation ?
- `bdd.c1.l1.i02` [qcm, d2] Choisis la démarche qui échappe au biais de confirmation.
- `bdd.c1.l1.i03` [vrai_faux, d2] Vrai ou faux : réponds à l'affirmation de Pie.
- `bdd.c1.l1.i04` [trous, d2] Complète la règle d'or de Mirabelle avec les bons mots.
- `bdd.c1.l2.i01` [qcm, d2] Choisis ce que l'expérience de la roue de la fortune a montré.
- `bdd.c1.l2.i02` [ordre, d3] Remets ces travaux d'enquête sur les biais dans l'ordre chronologique.
- `bdd.c1.l2.i03` [saisie, d3] Nomme le biais que Thorndike a mis en évidence en 1920.
- `bdd.c1.l3.i01` [qcm, d3] Choisis où Abraham Wald a recommandé de blinder les avions.
- `bdd.c1.l3.i02` [vrai_faux, d3] Vrai ou faux : juge l'affirmation que Pie lâche en picorant son journal.
- `bdd.c1.l3.i03` [appariement, d5] BOSS : associe chaque scène d'enquête au biais qui la gouverne.
- `bdd.c2.l1.i01` [qcm, d1] Choisis la source primaire dans cette enquête.
- `bdd.c2.l1.i02` [appariement, d2] Associe chaque ficelle de clickbait à sa description.
- `bdd.c2.l1.i03` [vrai_faux, d2] Dis si l'affirmation est vraie ou fausse.
- `bdd.c2.l1.i04` [flashcard, d1] Retourne la carte et retiens la différence.
- `bdd.c2.l2.i05` [ordre, d3] Remets dans l'ordre les étapes d'une lecture latérale.
- `bdd.c2.l2.i06` [trous, d2] Complète le texte sur la vérification d'une photo suspecte.
- `bdd.c2.l2.i07` [qcm, d3] Choisis l'explication la plus probable.
- `bdd.c2.l3.i08` [saisie, d2] Écris le mot-clé du critère d'enquête qui manque.
- `bdd.c2.l3.i09` [vrai_faux, d3] Dis si l'affirmation est vraie ou fausse.
- `bdd.c2.l3.i10` [qcm, d5] Boss : choisis la meilleure démarche d'enquête complète.
- `bdd.c3.l1.i01` [qcm, d1] Choisis l'explication la plus solide du lien observé.
- `bdd.c3.l1.i02` [trous, d2] Complète le rapport de l'inspectrice avec les bons mots.
- `bdd.c3.l1.i03` [qcm, d3] Identifie le principal défaut de ce sondage historique.
- `bdd.c3.l1.i04` [vrai_faux, d2] Vrai ou faux ? Tranche comme Mirabelle.
- `bdd.c3.l2.i01` [saisie, d2] Calcule la médiane des salaires, en euros.
- `bdd.c3.l2.i02` [saisie, d3] Calcule la réduction relative du risque, en pourcentage.
- `bdd.c3.l2.i03` [appariement, d2] Associe chaque notion à sa définition.
- `bdd.c3.l3.i01` [ordre, d2] Remets dans l'ordre la méthode pour interroger un graphique.
- `bdd.c3.l3.i02` [saisie, d3] Indique combien de fois la barre B paraît plus haute que A.
- `bdd.c3.l3.i03` [saisie, d5] Calcule la probabilité d'être vraiment malade après un test positif, en % arrondi à l'unité.

## 4. Checklist « dossier complet » avant publication d'un univers

**Contenu / pédagogie**
- [ ] `universe.json` + `skills.json` valides au schéma ; graphe acyclique ; ≥ 3 chapitres
- [ ] ≥ 6 items par compétence, ≥ 3 types d'exercices par chapitre, pool boss ≥ 20 items
- [ ] Chaque leçon 2-3 min, 1 idée, 4-6 items ; chaque chapitre a son boss et son récap
- [ ] 100 % des items ≥ 10/12 sur la grille qualité ; relecture croisée signée
- [ ] Faits sourcés (sources vérifiables, date de consultation) ; cas fictifs signalés
- [ ] Ton et personnages cohérents (bible de style à jour) ; pas de contenu partisan/stéréotypé
- [ ] Parcours testé par ≥ 5 apprenants-cobayes (temps de leçon, compréhension, plaisir)
- [ ] Au moins une leçon d'accroche gratuite sans compte

**SEO**
- [ ] title ≤ 60, meta description ≤ 155, un H1, slug propre et canonical
- [ ] OG/Twitter image 1200×630, schema.org Course (+ FAQPage), sitemap.xml mis à jour
- [ ] Page « à propos du contenu » (auteur, relecteur, méthode, date de mise à jour) pour E-E-A-T
- [ ] Mots-clés cibles et intention (informationnelle) ; 3+ pages glossaire/longue traîne ; maillage interne
- [ ] Core Web Vitals OK (LCP < 2,5 s), images WebP avec alt, pas de contenu bloqué au crawl
- [ ] Mention de l'univers dans la landing + lien depuis les univers voisins

**QA technique**
- [ ] Validation JSON Schema en CI (ids uniques, `bonne` ∈ choix, trous cohérents, prérequis existants)
- [ ] Test automatique : chaque item rejoué avec sa réponse attendue = « correct », tout distracteur = « incorrect »
- [ ] Tests de correction tolérante (accents, casse, virgule/point décimal)
- [ ] Accessibilité WCAG 2.2 AA : clavier, lecteur d'écran, contraste, `prefers-reduced-motion`
- [ ] Mobile-first testé (360 px), hors-ligne partiel (leçon en cache) si prévu
- [ ] Boss : cas d'échec/victoire/reprise, aucune boucle bloquante
- [ ] Orthographe/grammaire passées (outil + relecture humaine)

**Légal / RGPD / éthique**
- [ ] Droits : textes originaux ou licence compatible ; images/sons libres ou créés (registre des licences) ; aucun logo/marque/média réel utilisé sans droit
- [ ] Mentions légales, CGU, politique de confidentialité à jour ; cookies : bandeau conforme CNIL (refus aussi simple que l'accord), analytics sans consentement seulement si exempté (mesure d'audience anonyme)
- [ ] Données minimales de progression (XP, compétences) : base légale, durée de conservation, droit d'accès/suppression/export testé ; mineurs : < 15 ans, consentement parental (loi française) ou mode sans compte
- [ ] Pas de collecte de données sensibles ; pas de profilage publicitaire ; hébergeur UE
- [ ] Contenu santé/finance/droit : bandeau « information pédagogique, pas un conseil » + revue par un professionnel pour `atp`
- [ ] Mécaniques d'engagement sans dark pattern : pas de culpabilisation, pas de perte d'acquis, pas de pression temporelle d'achat, notifications opt-in et plafonnées, sortie facile (« j'ai fini pour aujourd'hui »)
- [ ] Mention IA si du contenu est généré/assisté (transparence) et relecture humaine effective
- [ ] Procédure de signalement d'erreur (bouton « un doute sur cet item ? ») et de correction sous 7 jours
