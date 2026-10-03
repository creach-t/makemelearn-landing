# Runbook — bascule vers le pipeline GHCR (lot 10)

Remplace RUNBOOK-lot0.md (la rotation du mot de passe y est intégrée). État de départ constaté sur le VPS :
ancienne pile dans `/root/projects/makemelearn-landing` (conteneurs `makemelearn_postgres`, `makemelearn_api`, `makemelearn_frontend`, volume `makemelearn_postgres_data`) ; `.env` préparé dans ce dossier (SESSION_SECRET, MAINTENANCE_TOKEN, TRUST_PROXY_HOPS=2, SMTP_*) mais avec l'ANCIEN mot de passe Postgres.

Le nouveau compose réutilise le même nom de conteneur Postgres et le même volume : l'ancienne pile doit être arrêtée (sans `-v`) avant le premier déploiement. Coupure attendue : quelques minutes.

## Avant de commencer (poste local)
1. Relire le diff, commiter et pousser sur une branche, ouvrir une PR : la CI doit passer au vert (tests sur Postgres 15).
2. Ne fusionner dans `main` qu'au moment de faire les étapes VPS ci-dessous : le merge déclenche le déploiement.

## Étapes VPS (une à la fois)
1. **Sauvegarde** : `docker exec makemelearn_postgres pg_dump -U makemelearn_user makemelearn | gzip > /root/makemelearn-$(date +%F).sql.gz` puis `ls -lh /root/makemelearn-*.sql.gz` (taille non nulle).
2. **Rotation du mot de passe** : générer le nouveau, `ALTER USER` dans la base, mettre à jour `POSTGRES_PASSWORD` dans `.env`.
3. **Arrêt de l'ancienne pile** : `cd /root/projects/makemelearn-landing && docker compose down` (JAMAIS `-v`).
4. **Dossier cible** : `/opt/makemelearn` (`VPS_DEPLOY_PATH`), y copier le `.env` (droits 600).
5. **Déploiement** : fusionner la PR dans `main` ; suivre le job Deploy dans GitHub Actions.
6. **Vérifications** : `docker ps` (conteneurs `makemelearn` et `makemelearn_postgres` healthy), `https://makemelearn.fr/` charge, `/api/v1/healthz` répond, `/docker-compose.yml` renvoie 404, formulaire de contact et lien magique testés.
7. **Retour arrière** (si échec) : `cd /root/projects/makemelearn-landing && docker compose up -d` relance l'ancienne pile (même volume) ; la base 002 ajoutée est inoffensive pour l'ancien code ; en dernier recours restaurer le dump de l'étape 1.

## Nettoyage après quelques jours stables
- Supprimer les anciens secrets GitHub `SERVER_HOST`, `SERVER_PORT`, `SERVER_SSH_KEY`, `SERVER_USER`.
- Supprimer `/root/projects/makemelearn-landing` et `.env.bak-*` une fois certain de ne plus revenir en arrière.
- Planifier un `pg_dump` régulier.
- Prometheus : `makemelearn.fr` est déjà dans le job `sites`, rien à ajouter.
