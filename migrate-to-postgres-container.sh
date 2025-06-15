#!/bin/bash

# 🐘 Migration vers PostgreSQL Container - MakeMeLearn
# Ce script migre de PostgreSQL externe vers PostgreSQL en container

echo "🐘 Migration PostgreSQL External → Container"
echo "============================================="

# Variables
PROJECT_DIR=$(pwd)
BACKUP_DIR="$HOME/backups/makemelearn"
DATE=$(date +%Y%m%d_%H%M%S)

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ❌${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] ℹ️${NC} $1"
}

# Vérifier qu'on est dans le bon dossier
if [ ! -f "docker-compose.yml" ]; then
    error "Fichier docker-compose.yml non trouvé"
    error "Exécutez ce script depuis le dossier racine du projet"
    exit 1
fi

log "Dossier projet détecté: $PROJECT_DIR"

# Créer le dossier de sauvegarde
mkdir -p "$BACKUP_DIR"
log "Dossier sauvegarde: $BACKUP_DIR"

# 1. Arrêter les services actuels
log "⏹️ Arrêt des services actuels..."
docker compose down --remove-orphans 2>/dev/null || true

# 2. Sauvegarder l'ancien .env
if [ -f ".env" ]; then
    log "💾 Sauvegarde de l'ancien .env..."
    cp .env "$BACKUP_DIR/.env.external.$DATE"
    log "✅ .env sauvegardé vers $BACKUP_DIR/.env.external.$DATE"
fi

# 3. Créer le nouveau .env basé sur .env.example
log "🔧 Création du nouveau fichier .env..."
if [ -f ".env.example" ]; then
    cp .env.example .env
    log "✅ Nouveau .env créé à partir de .env.example"
else
    error ".env.example non trouvé"
    exit 1
fi

# 4. Nettoyer les anciens volumes/réseaux si ils existent
log "🧹 Nettoyage des anciens volumes Docker..."
docker volume rm makemelearn_postgres_data 2>/dev/null || true
docker network rm makemelearn_network 2>/dev/null || true

# 5. Créer les réseaux nécessaires
log "🌐 Création des réseaux Docker..."
docker network create traefik-public 2>/dev/null || warn "Réseau traefik-public existe déjà"
log "✅ Réseaux configurés"

# 6. Démarrer PostgreSQL en premier
log "🐘 Démarrage de PostgreSQL..."
docker compose up -d postgres

# Attendre que PostgreSQL soit prêt
log "⏳ Attente que PostgreSQL soit prêt..."
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U makemelearn_user -d makemelearn >/dev/null 2>&1; then
        log "✅ PostgreSQL prêt (tentative $i)"
        break
    fi
    if [ $i -eq 30 ]; then
        error "PostgreSQL n'a pas pu démarrer dans les temps"
        docker compose logs postgres
        exit 1
    fi
    sleep 2
done

# 7. Vérifier que l'initialisation s'est bien passée
log "🔍 Vérification de l'initialisation de la base..."
if docker compose exec -T postgres psql -U makemelearn_user -d makemelearn -c "SELECT COUNT(*) FROM registrations;" >/dev/null 2>&1; then
    log "✅ Tables créées avec succès"
else
    error "Problème avec l'initialisation de la base"
    docker compose logs postgres
    exit 1
fi

# 8. Démarrer l'API
log "🚀 Démarrage de l'API..."
docker compose up -d api

# Attendre que l'API soit prête
log "⏳ Attente que l'API soit prête..."
for i in {1..30}; do
    if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
        log "✅ API prête (tentative $i)"
        break
    fi
    if [ $i -eq 30 ]; then
        error "API n'a pas pu démarrer dans les temps"
        docker compose logs api
        exit 1
    fi
    sleep 2
done

# 9. Démarrer le frontend
log "🌐 Démarrage du frontend..."
docker compose up -d frontend

# 10. Vérifier l'état final
log "🔍 Vérification de l'état final..."
docker compose ps

echo ""
echo "🎉 Migration terminée avec succès !"
echo "=================================="
echo ""
info "📊 Services déployés:"
echo "  🐘 PostgreSQL: Container local avec données persistantes"
echo "  🚀 API: https://makemelearn.fr/api/health"
echo "  🌐 Frontend: https://makemelearn.fr"
echo ""
info "💾 Sauvegardes:"
echo "  📄 Ancien .env: $BACKUP_DIR/.env.external.$DATE"
echo ""
info "🔧 Tests à effectuer:"
echo "  1. curl https://makemelearn.fr/api/health"
echo "  2. curl https://makemelearn.fr/api/stats/public"
echo "  3. Test d'inscription sur le site"
echo ""
info "📋 Commandes utiles:"
echo "  📊 Logs: docker compose logs -f"
echo "  🐘 Accès DB: docker compose exec postgres psql -U makemelearn_user -d makemelearn"
echo "  🔄 Redémarrage: docker compose restart"
echo ""

# 11. Test final des endpoints
log "🧪 Test final des endpoints..."
if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
    log "✅ Health check OK"
else
    warn "Health check échoué - vérifiez les logs"
fi

if curl -f -s http://localhost:3000/api/stats/public >/dev/null 2>&1; then
    log "✅ Stats endpoint OK"
else
    warn "Stats endpoint échoué - normal si pas de données"
fi

echo ""
echo "🚀 Votre stack MakeMeLearn avec PostgreSQL container est opérationnelle !"
echo "📱 Plus de problèmes de connexion externe - tout est en local Docker !"