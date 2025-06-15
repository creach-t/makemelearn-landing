# Guide de Dépannage MakeMeLearn

## 🚨 Problème résolu

D'après l'analyse de vos logs, votre API **fonctionne correctement** ! Le problème venait du script de déploiement qui testait mal la disponibilité des services.

### ✅ Ce qui fonctionne maintenant :
- PostgreSQL démarre et est healthy
- L'API se connecte à la base de données
- L'API démarre sur le port 3000
- L'API répond aux requêtes `/health`
- Tests de santé améliorés

### 🔧 Corrections apportées :
- Script de déploiement amélioré avec test interne de l'API
- Health checks Docker optimisés avec timeouts adaptés
- Meilleure gestion des erreurs et diagnostic

## 🚀 Utilisation du nouveau script

### Commandes disponibles

```bash
# Déploiement complet (défaut)
./deploy.sh
./deploy.sh deploy

# Afficher le status des services
./deploy.sh status

# Voir les logs en temps réel
./deploy.sh logs

# Redémarrer les services
./deploy.sh restart
```

## 🔍 Diagnostic

### Vérifier le status des containers
```bash
cd ~/projects/makemelearn-landing
docker compose ps
```

### Voir les logs
```bash
# Logs de tous les services
docker compose logs

# Logs spécifiques
docker compose logs postgres
docker compose logs api
docker compose logs frontend

# Logs en temps réel
docker compose logs -f api
```

### Tester l'API manuellement
```bash
# Test direct dans le container
docker compose exec api curl http://localhost:3000/health

# Test depuis l'extérieur (si Traefik configuré)
curl https://makemelearn.fr/api/health
```

### Vérifier la base de données
```bash
# Connexion à PostgreSQL
docker compose exec postgres psql -U makemelearn_user -d makemelearn

# Test de connexion simple
docker compose exec postgres psql -U makemelearn_user -d makemelearn -c "SELECT version();"
```

## 🔧 Résolution de problèmes courants

### L'API ne démarre pas
```bash
# Vérifier les logs de l'API
docker compose logs api

# Redémarrer juste l'API
docker compose restart api

# Reconstruire l'API
docker compose up -d --build api
```

### PostgreSQL ne démarre pas
```bash
# Vérifier les logs PostgreSQL
docker compose logs postgres

# Vérifier l'espace disque
df -h

# Vérifier les permissions des volumes
docker volume inspect makemelearn_postgres_data
```

### Frontend inaccessible
```bash
# Vérifier Nginx
docker compose logs frontend

# Tester Nginx directement
docker compose exec frontend wget -O- http://localhost/
```

### Problème de réseau
```bash
# Vérifier les réseaux Docker
docker network ls

# Créer le réseau traefik-public s'il manque
docker network create traefik-public

# Reconnecter les services
docker compose down
docker compose up -d
```

## 📊 Commandes de monitoring

### Status complet
```bash
./deploy.sh status
```

### Surveillance continue
```bash
# Logs en temps réel
./deploy.sh logs

# Ou spécifique à un service
docker compose logs -f api
```

### Performance
```bash
# Utilisation des ressources
docker stats

# Espace disque des volumes
docker system df
```

## 🔄 Redéploiement

### Redéploiement complet
```bash
./deploy.sh deploy
```

### Redéploiement sans cache
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Mise à jour du code seulement
```bash
git pull origin main
docker compose restart
```

## 🔒 Sécurité

### Vérifier les variables d'environnement
```bash
# Afficher la config (sans les mots de passe)
docker compose config
```

### Backup de la base de données
```bash
# Backup manuel
docker compose exec postgres pg_dump -U makemelearn_user makemelearn > backup.sql

# Le script fait automatiquement un backup avant déploiement
```

## 🌐 Tests de connectivité

### Test local (dans les containers)
```bash
# API
docker compose exec api curl http://localhost:3000/health

# Frontend
docker compose exec frontend curl http://localhost/

# Base de données
docker compose exec api curl http://postgres:5432
```

### Test externe (via Traefik)
```bash
# Site principal
curl -I https://makemelearn.fr

# API
curl https://makemelearn.fr/api/health

# Avec verbose pour debug
curl -v https://makemelearn.fr/api/health
```

## 🆘 En cas d'urgence

### Arrêt d'urgence
```bash
docker compose down
```

### Redémarrage rapide
```bash
./deploy.sh restart
```

### Reset complet (⚠️ PERTE DE DONNÉES)
```bash
docker compose down -v  # Supprime aussi les volumes
docker system prune -a  # Nettoie tout Docker
./deploy.sh deploy      # Redéploie tout
```

### Restauration depuis backup
```bash
# Arrêter les services
docker compose down

# Restaurer la DB depuis backup
docker compose up -d postgres
cat backup.sql | docker compose exec -T postgres psql -U makemelearn_user makemelearn

# Redémarrer tout
docker compose up -d
```

## 📞 Support

Si le problème persiste après avoir suivi ce guide :

1. Exécutez : `./deploy.sh status > debug.log`
2. Ajoutez : `docker compose logs >> debug.log`
3. Vérifiez les URLs :
   - https://makemelearn.fr
   - https://makemelearn.fr/api/health

Votre application devrait maintenant fonctionner correctement ! 🎉