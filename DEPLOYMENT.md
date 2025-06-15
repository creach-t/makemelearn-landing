# Guide de Déploiement MakeMeLearn Simplifié

**🎯 TOUT SUR `makemelearn.fr` - Architecture unifiée**

Ce guide explique comment déployer le système complet MakeMeLearn avec Docker, PostgreSQL et Traefik sur un seul domaine.

## 📋 Prérequis

- Serveur avec Docker et Docker Compose installés
- Traefik déjà configuré avec network `traefik-public`
- Domaine `makemelearn.fr` pointant vers votre serveur

## 🌐 Configuration DNS Simplifiée

Configurez seulement ces enregistrements DNS :

```
makemelearn.fr        A    [IP_DE_VOTRE_SERVEUR]
www.makemelearn.fr    A    [IP_DE_VOTRE_SERVEUR]
```

**✅ Plus besoin de sous-domaine `inscription` !**

## 🏗️ Architecture Unifiée

```
https://makemelearn.fr/          → Frontend (HTML/CSS/JS)
https://makemelearn.fr/api/      → API Backend (Node.js)
https://makemelearn.fr/api/health → Health Check
```

## 🚀 Déploiement Automatique avec CI/CD

### 1. Configuration des secrets GitHub

Dans votre repository GitHub, ajoutez ces secrets (`Settings > Secrets and variables > Actions`) :

```
SERVER_HOST=votre-ip-serveur
SERVER_USER=votre-username-ssh
SERVER_SSH_KEY=votre-clé-privée-ssh
SERVER_PORT=22
```

### 2. Préparation du serveur

```bash
# Connectez-vous à votre serveur
ssh user@votre-serveur

# Créer les dossiers
mkdir -p ~/projects
cd ~/projects

# Cloner le repository
git clone https://github.com/creach-t/makemelearn-landing.git
cd makemelearn-landing

# Copier et configurer l'environnement
cp .env.example .env
nano .env  # Configurer vos valeurs
```

### 3. Configuration minimale .env

```env
# Base de données - Changez le mot de passe !
DATABASE_URL=postgresql://makemelearn_user:VOTRE_MOT_DE_PASSE_SECURISE@postgres:5432/makemelearn
POSTGRES_PASSWORD=VOTRE_MOT_DE_PASSE_SECURISE

# CORS simplifié
CORS_ORIGIN=https://makemelearn.fr

# Token de maintenance (générez-en un)
MAINTENANCE_TOKEN=votre-token-securise-de-32-caracteres

# Environnement
NODE_ENV=production
PORT=3000
```

### 4. Déploiement initial

```bash
# Créer le network Traefik
docker network create traefik-public

# Lancer les services
docker compose up -d

# Vérifier les logs
docker compose logs -f
```

### 5. Vérification

```bash
# Frontend
curl -I https://makemelearn.fr

# API Health
curl https://makemelearn.fr/api/health

# API Stats
curl https://makemelearn.fr/api/stats/public
```

## 🔄 Déploiement Automatique

**Votre CI/CD est maintenant configuré !** À chaque push sur `main` :

1. ✅ **Tests automatiques** de l'API et du frontend
2. ✅ **Build** de l'image Docker
3. ✅ **Déploiement** sur votre serveur
4. ✅ **Vérifications** post-déploiement
5. ✅ **Notification** du statut

### Workflow CI/CD

```yaml
# Le workflow est déjà configuré dans .github/workflows/deploy.yml
# Il va automatiquement :
on:
  push:
    branches: [main]  # Déploie à chaque push sur main

jobs:
  test-api      # Tests de l'API avec PostgreSQL
  test-frontend # Validation HTML/CSS/JS
  build         # Build des images Docker
  deploy        # Déploiement SSH vers votre serveur
  post-tests    # Vérification que tout fonctionne
```

## 📊 Monitoring

### Health Checks

```bash
# Santé globale
curl https://makemelearn.fr/api/health

# Santé détaillée (avec auth)
curl -H "Authorization: Bearer $MAINTENANCE_TOKEN" \
  https://makemelearn.fr/api/health/detailed

# Statistiques publiques
curl https://makemelearn.fr/api/stats/public
```

### Logs en temps réel

```bash
# API
docker compose logs -f api

# Base de données
docker compose logs -f postgres

# Frontend
docker compose logs -f frontend

# Tout
docker compose logs -f
```

## 🔧 Gestion des Services

### Redémarrage

```bash
# Redémarrer tout
docker compose restart

# Redémarrer seulement l'API
docker compose restart api

# Mise à jour avec rebuild
docker compose up -d --build
```

### Sauvegarde automatique

```bash
# Script de sauvegarde
cat << 'EOF' > ~/backup-makemelearn.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/backups/makemelearn"
mkdir -p "$BACKUP_DIR"

# Sauvegarde base de données
docker compose -f ~/projects/makemelearn-landing/docker-compose.yml \
  exec -T postgres pg_dump -U makemelearn_user makemelearn > \
  "$BACKUP_DIR/makemelearn_$DATE.sql"

# Compresser
gzip "$BACKUP_DIR/makemelearn_$DATE.sql"

# Garder 7 dernières sauvegardes
find "$BACKUP_DIR" -name "makemelearn_*.sql.gz" -mtime +7 -delete

echo "✅ Backup créé: makemelearn_$DATE.sql.gz"
EOF

chmod +x ~/backup-makemelearn.sh

# Crontab pour sauvegarde quotidienne à 2h
echo "0 2 * * * $HOME/backup-makemelearn.sh" | crontab -
```

## 🐛 Dépannage

### Problèmes courants

**1. Services qui ne démarrent pas**
```bash
# Vérifier les logs
docker compose logs

# Vérifier l'espace disque
df -h

# Nettoyer Docker
docker system prune -f
```

**2. API non accessible**
```bash
# Vérifier le routing Traefik
docker compose logs api | grep -i traefik

# Vérifier les labels
docker inspect makemelearn_api | grep -A 20 Labels

# Tester en direct
docker compose exec api curl localhost:3000/health
```

**3. Base de données inaccessible**
```bash
# Se connecter à PostgreSQL
docker compose exec postgres psql -U makemelearn_user -d makemelearn

# Vérifier les connexions
docker compose exec postgres psql -U makemelearn_user -d makemelearn -c "SELECT * FROM pg_stat_activity;"
```

**4. Frontend non accessible**
```bash
# Vérifier nginx
docker compose logs frontend

# Tester nginx directement
docker compose exec frontend nginx -t
```

## 📈 Optimisations

### Performance

1. **Monitoring avec Grafana** (optionnel)
```yaml
# docker-compose.override.yml
version: '3.8'
services:
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

2. **Cache Redis** (pour plus tard)
```yaml
  redis:
    image: redis:alpine
    volumes:
      - redis_data:/data
```

## 🔒 Sécurité

### SSL automatique
- Traefik gère automatiquement Let's Encrypt
- Certificats renouvelés automatiquement

### Firewall basique
```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 📝 Checklist de Déploiement

- [ ] DNS configuré (makemelearn.fr pointant vers le serveur)
- [ ] Traefik installé avec network `traefik-public`
- [ ] Repository cloné sur le serveur
- [ ] Fichier `.env` configuré avec vrais mots de passe
- [ ] Secrets GitHub configurés pour CI/CD
- [ ] Services lancés : `docker compose up -d`
- [ ] Tests passants :
  - [ ] https://makemelearn.fr (frontend)
  - [ ] https://makemelearn.fr/api/health (API)
  - [ ] https://makemelearn.fr/api/stats/public (stats)
- [ ] Sauvegarde automatique configurée
- [ ] CI/CD fonctionnel (push test sur main)

## 🎉 C'est parti !

Votre MakeMeLearn est maintenant :
- **🌐 En ligne** : https://makemelearn.fr
- **🔧 API opérationnelle** : https://makemelearn.fr/api/
- **📊 Monitoring** : https://makemelearn.fr/api/health
- **🚀 CI/CD automatique** : Push sur main = déploiement auto

### URLs importantes
- **Site principal** : https://makemelearn.fr
- **API Health** : https://makemelearn.fr/api/health  
- **Statistiques** : https://makemelearn.fr/api/stats/public
- **Repository** : https://github.com/creach-t/makemelearn-landing

**Support** : hello@makemelearn.fr

---

## 🚀 Test de votre CI/CD

Pour tester que tout fonctionne :

1. Faites un petit changement dans votre code
2. Commitez et poussez sur `main`
3. Allez dans `Actions` sur GitHub
4. Regardez le déploiement automatique se faire
5. Vérifiez que vos changements apparaissent sur https://makemelearn.fr

**🎯 Votre architecture unifiée MakeMeLearn est prête !**