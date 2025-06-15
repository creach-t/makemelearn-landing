# Guide de Déploiement MakeMeLearn

Ce guide explique comment déployer le système complet MakeMeLearn avec Docker, PostgreSQL et Traefik.

## 📋 Prérequis

- Serveur avec Docker et Docker Compose installés
- Traefik déjà configuré et lancé (avec network `traefik`)
- Nom de domaine pointant vers votre serveur
- Sous-domaine API configuré

## 🌐 Configuration DNS

Assurez-vous que vos domaines pointent vers votre serveur :

```
makemelearn.fr        A    192.168.1.100
www.makemelearn.fr    A    192.168.1.100
inscription.makemelearn.fr  A    192.168.1.100
```

## 🚀 Déploiement Rapide

### 1. Cloner le repository

```bash
git clone https://github.com/creach-t/makemelearn-landing.git
cd makemelearn-landing
```

### 2. Configuration des variables d'environnement

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer avec vos valeurs
nano .env
```

**Variables importantes à modifier :**

```env
# Mot de passe PostgreSQL (générez un mot de passe fort)
POSTGRES_PASSWORD=votre-mot-de-passe-tres-securise

# Token de maintenance (générez un token aléatoire)
MAINTENANCE_TOKEN=votre-token-de-maintenance-securise

# CORS Origins (ajustez selon vos domaines)
CORS_ORIGIN=https://makemelearn.fr,https://inscription.makemelearn.fr
```

### 3. Lancer les services

```bash
# Créer le network Traefik si nécessaire
docker network create traefik

# Lancer les services
docker-compose up -d

# Vérifier les logs
docker-compose logs -f
```

### 4. Vérification

```bash
# Vérifier que tous les services sont up
docker-compose ps

# Tester la santé de l'API
curl https://inscription.makemelearn.fr/health

# Tester le frontend
curl https://makemelearn.fr
```

## 🔧 Configuration Avancée

### Configuration PostgreSQL

La base de données est automatiquement initialisée avec le script `database/init.sql`. Vous pouvez :

```bash
# Se connecter à PostgreSQL
docker-compose exec postgres psql -U makemelearn_user -d makemelearn

# Voir les tables créées
\dt

# Voir les statistiques
SELECT * FROM registration_stats;
```

### Configuration Traefik

Exemple de configuration Traefik (dans votre `traefik.yml`) :

```yaml
entrypoints:
  web:
    address: ":80"
    http:
      redirections:
        entrypoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesresolvers:
  letsencrypt:
    acme:
      email: admin@makemelearn.fr
      storage: /data/acme.json
      httpchallenge:
        entrypoint: web
```

### Sauvegarde PostgreSQL

```bash
# Script de sauvegarde automatique
cat << 'EOF' > backup-postgres.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="makemelearn_backup_$DATE.sql"

docker-compose exec -T postgres pg_dump -U makemelearn_user makemelearn > "$BACKUP_NAME"
gzip "$BACKUP_NAME"

# Garder seulement les 7 dernières sauvegardes
find . -name "makemelearn_backup_*.sql.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_NAME.gz"
EOF

chmod +x backup-postgres.sh

# Ajouter au crontab pour sauvegarde quotidienne
echo "0 2 * * * /path/to/backup-postgres.sh" | crontab -
```

## 📊 Monitoring

### Health Checks

```bash
# API Health Check
curl https://inscription.makemelearn.fr/health

# Detailed Health Check
curl https://inscription.makemelearn.fr/health/detailed

# Métriques Prometheus
curl https://inscription.makemelearn.fr/health/metrics
```

### Logs

```bash
# Logs de l'API
docker-compose logs -f api

# Logs PostgreSQL
docker-compose logs -f postgres

# Logs Nginx
docker-compose logs -f frontend
```

### Statistiques

```bash
# Statistiques publiques
curl https://inscription.makemelearn.fr/api/stats/public

# Statistiques de croissance
curl https://inscription.makemelearn.fr/api/stats/growth
```

## 🔒 Sécurité

### Certificats SSL

Les certificats sont automatiquement générés par Traefik via Let's Encrypt.

### Rate Limiting

L'API a des limitations intégrées :
- 100 requêtes par 15 minutes (général)
- 5 inscriptions par heure par IP

### Headers de Sécurité

Nginx ajoute automatiquement les headers de sécurité :
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security`

## 🔄 Mise à Jour

### Déploiement continu

```bash
# Script de mise à jour
cat << 'EOF' > update.sh
#!/bin/bash
echo "🔄 Mise à jour MakeMeLearn..."

# Pull du code
git pull origin main

# Rebuild et restart
docker-compose build --no-cache api
docker-compose up -d

# Vérification
sleep 10
docker-compose ps
curl -f https://inscription.makemelearn.fr/health || echo "❌ Health check failed"

echo "✅ Mise à jour terminée"
EOF

chmod +x update.sh
```

### Maintenance

```bash
# Déclencher la maintenance (nettoyage DB)
curl -X POST https://inscription.makemelearn.fr/health/maintenance \
  -H "Authorization: Bearer ${MAINTENANCE_TOKEN}"

# Redémarrer les services
docker-compose restart
```

## 🐛 Dépannage

### Problèmes Courants

**1. Services qui ne démarrent pas**
```bash
# Vérifier les logs
docker-compose logs

# Vérifier l'espace disque
df -h

# Vérifier le network Traefik
docker network ls | grep traefik
```

**2. Base de données inaccessible**
```bash
# Vérifier PostgreSQL
docker-compose exec postgres pg_isready -U makemelearn_user

# Recréer le volume si nécessaire
docker-compose down -v
docker-compose up -d
```

**3. Certificats SSL non générés**
```bash
# Vérifier les logs Traefik
docker logs traefik

# Vérifier la configuration DNS
nslookup makemelearn.fr
```

**4. CORS Errors**
```bash
# Vérifier la configuration CORS dans .env
grep CORS_ORIGIN .env

# Redémarrer l'API
docker-compose restart api
```

### Commandes Utiles

```bash
# Voir l'utilisation des ressources
docker stats

# Nettoyer les images inutilisées
docker system prune -f

# Voir les connexions à la base
docker-compose exec postgres psql -U makemelearn_user -d makemelearn -c "SELECT * FROM pg_stat_activity;"

# Redémarrer uniquement l'API
docker-compose restart api

# Voir les dernières inscriptions
docker-compose exec postgres psql -U makemelearn_user -d makemelearn -c "SELECT email, created_at FROM registrations ORDER BY created_at DESC LIMIT 10;"
```

## 📈 Optimisations

### Performance

1. **Optimisation PostgreSQL** (`postgresql.conf`) :
```
shared_buffers = 256MB
max_connections = 100
effective_cache_size = 1GB
```

2. **Optimisation Nginx** (déjà configuré) :
- Compression gzip
- Cache des assets statiques
- Keep-alive connections

3. **Monitoring avec Prometheus** :
```yaml
# docker-compose.override.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

### Scalabilité

Pour une utilisation en production intensive :

1. **Load Balancer** : Utilisez plusieurs instances de l'API
2. **Cache Redis** : Ajoutez Redis pour les sessions
3. **CDN** : Utilisez un CDN pour les assets statiques
4. **Base de données séparée** : Utilisez une instance PostgreSQL dédiée

## 📞 Support

En cas de problème :

1. Vérifiez les logs : `docker-compose logs`
2. Consultez la documentation API : `https://inscription.makemelearn.fr/`
3. Contactez : hello@makemelearn.fr

## 🔗 Liens Utiles

- **Frontend** : https://makemelearn.fr
- **API** : https://inscription.makemelearn.fr
- **Health Check** : https://inscription.makemelearn.fr/health
- **Statistiques** : https://inscription.makemelearn.fr/api/stats/public
- **Repository** : https://github.com/creach-t/makemelearn-landing

---

## 🎯 Checklist de Déploiement

- [ ] DNS configuré (makemelearn.fr et inscription.makemelearn.fr)
- [ ] Traefik installé et configuré
- [ ] Variables d'environnement configurées (.env)
- [ ] Services lancés (`docker-compose up -d`)
- [ ] Health checks passants
- [ ] Certificats SSL générés
- [ ] Sauvegarde automatique configurée
- [ ] Monitoring en place
- [ ] Tests d'inscription fonctionnels

**Votre installation MakeMeLearn est prête ! 🚀**