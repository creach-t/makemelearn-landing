# Spec du format "univers" (v1.0) — extrait pour les agents rédacteurs

Un item = objet JSON. Champs communs :
- id: "bdd.c1.l1.i03" (univers.chapitre.leçon.item), unique, stable
- type: "qcm" | "vrai_faux" | "trous" | "appariement" | "ordre" | "saisie" | "code" | "flashcard"
- competence: id de compétence (ex "bdd.biais.confirmation")
- difficulte: 1-5
- consigne: 1 phrase impérative (<= 140 car.)
- enonce: contexte/mise en situation (<= 300 car.)
- feedback_ok: explication courte (1-2 phrases) POURQUOI c'est juste
- feedback_ko: explication qui démonte l'erreur typique (pas juste "faux")
- indice: optionnel (1 phrase, ne donne pas la réponse)
- sources: liste de références vérifiables (obligatoire si fait chiffré/historique), sinon []
- duree_s: temps estimé (10-40)

Champs par type :
- qcm: choix:[{id,texte,distracteur_pourquoi (si faux)}] (3-4 choix), bonne:"idA" (UNE seule bonne réponse)
- vrai_faux: affirmation, reponse:true|false
- trous: texte avec {{1}},{{2}}; trous:[{id:"1", reponses_acceptees:["..."], banque:["..."]}]
- appariement: paires:[{gauche,droite}] (4-5 paires, 1-1)
- ordre: elements:["..."] DANS LE BON ORDRE (le client mélange), critere_ordre: phrase
- saisie: reponses_acceptees:["..."], normalisation:["casse","accents","espaces"], reponse_modele
- flashcard: recto, verso, mnemo(optionnel)

Qualité: UNE seule bonne réponse défendable; distracteurs plausibles (erreurs réelles), jamais "toutes/aucune des réponses"; pas de négation piégeuse; pas de question dont la réponse est dans la formulation; feedback explicatif obligatoire; français correct, tutoiement, ton de l'univers; pas de dark pattern ; faits vérifiables et sourcés (pas d'invention de chiffres/études : si doute, formule en exemple fictif signalé "(cas fictif)").
Sortie : tableau JSON valide (UTF-8) d'items, écrit dans le fichier demandé. Valide-le avec node -e "JSON.parse(require('fs').readFileSync(f))".
