#!/bin/bash

# Script de déploiement automatique pour MakeMeLearn
# Usage: ./deploy.sh

set -e  # Exit on any error

# Configuration
PROJECT_DIR="$HOME/projects/makemelearn-landing"
DOMAIN="makemelearn.fr"
COMPOSE_FILE="docker-compose.yml"

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction de log
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Fonction de vérification des prérequis
check_requirements() {
    log "Vérification des prérequis..."

    # Vérifier que Docker est installé et fonctionne
    if ! command -v docker &> /dev/null; then
        error "Docker n'est pas installé"
    fi

    if ! docker info &> /dev/null; then
        error "Docker n'est pas démarré"
    fi

    # Vérifier que docker compose est disponible
    if ! docker compose version &> /dev/null; then
        error "docker compose n'est pas disponible"
    fi

    # Vérifier que le dossier projet existe
    if [ ! -d "$PROJECT_DIR" ]; then
        error "Le dossier projet $PROJECT_DIR n'existe pas"
    fi

    # Vérifier que le réseau traefik-public existe
    if ! docker network ls | grep -q "traefik-public"; then
        warn "Le réseau traefik-public n'existe pas, création..."
        docker network create traefik-public || error "Impossible de créer le réseau traefik-public"
    fi

    log "✅ Prérequis validés"
}

# Fonction de sauvegarde
backup_current() {
    log "Sauvegarde de la version actuelle..."

    cd "$PROJECT_DIR"

    # Créer un backup de la base de données si elle existe
    if docker compose ps -q postgres 2>/dev/null | grep -q .; then
        log "Container PostgreSQL détecté, sauvegarde de la base de données..."
        
        # Créer le dossier de backup s'il n'existe pas
        mkdir -p ./backups
        
        # Backup de la base de données
        docker compose exec -T postgres pg_dump -U makemelearn_user makemelearn > "./backups/backup_$(date +%Y%m%d_%H%M%S).sql" || warn "Backup de la DB échoué"
    fi

    log "✅ Sauvegarde terminée"
}

# Fonction de mise à jour du code
update_code() {
    log "Mise à jour du code source..."

    cd "$PROJECT_DIR"

    # Stash les changements locaux
    git stash --include-untracked 2>/dev/null || true

    # Récupérer les dernières modifications
    git fetch origin main
    git reset --hard origin/main

    # Vérifier que le docker-compose.yml existe
    if [ ! -f "$COMPOSE_FILE" ]; then
        error "Le fichier $COMPOSE_FILE n'existe pas"
    fi

    log "✅ Code source mis à jour"
}

# Fonction de déploiement
deploy_containers() {
    log "Déploiement des containers..."

    cd "$PROJECT_DIR"

    # Arrêter les containers existants proprement
    log "Arrêt des containers existants..."
    docker compose down --remove-orphans

    # Construire et démarrer les containers
    log "Construction et démarrage des nouveaux containers..."
    docker compose pull
    docker compose up -d --build

    log "✅ Containers déployés"
}

# Fonction améliorée de vérification du déploiement
verify_deployment() {
    log "Vérification du déploiement..."

    cd "$PROJECT_DIR"

    # Attendre que les containers soient prêts
    log "⏳ Attente que les services soient prêts..."
    sleep 10

    # Vérifier les containers un par un
    log "🔄 Vérification des containers..."
    
    # Vérifier PostgreSQL
    if ! docker compose ps postgres | grep -q "Up"; then
        error "Container PostgreSQL n'est pas démarré"
    fi
    log "✅ PostgreSQL: OK"

    # Vérifier le frontend
    if ! docker compose ps frontend | grep -q "Up"; then
        error "Container Frontend n'est pas démarré"
    fi
    log "✅ Frontend: OK"

    # Vérifier l'API avec une approche améliorée
    log "🔄 Test du service API..."
    
    # D'abord vérifier que le container API est up
    if ! docker compose ps api | grep -q "Up"; then
        error "Container API n'est pas démarré"
    fi

    # Tester l'API directement dans le container (pas via l'URL externe)
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log "⏳ Test de l'API (tentative $attempt/$max_attempts)..."
        
        # Test direct dans le container
        if docker compose exec -T api curl -f -s http://localhost:3000/health > /dev/null 2>&1; then
            log "✅ API répond correctement sur le port interne"
            break
        elif [ $attempt -eq $max_attempts ]; then
            error "❌ API n'a pas démarré dans les temps"
        else
            info "⏳ API pas encore prêt (tentative $attempt/$max_attempts)..."
            sleep 2
        fi

        ((attempt++))
    done

    # Vérifier les logs pour des erreurs critiques
    log "📋 Vérification des logs récents..."
    
    # Afficher les logs de l'API pour diagnostic
    log "📋 API Logs:"
    docker compose logs --tail=20 api

    # Vérifier qu'il n'y a pas d'erreurs fatales
    if docker compose logs --tail=50 api | grep -i "fatal\|cannot\|failed.*start"; then
        warn "⚠️ Erreurs détectées dans les logs de l'API"
    else
        log "✅ Pas d'erreurs fatales détectées"
    fi

    # Test optionnel de l'URL externe (ne fait pas échouer le déploiement)
    log "🌐 Test optionnel de l'URL externe..."
    if curl -f -s --max-time 10 "https://$DOMAIN" > /dev/null 2>&1; then
        log "✅ Site accessible via https://$DOMAIN"
    else
        warn "⚠️ Site pas encore accessible via l'URL externe (normal si Traefik n'est pas encore configuré)"
    fi

    log "✅ Déploiement vérifié avec succès"
}

# Fonction de nettoyage
cleanup() {
    log "Nettoyage..."

    # Supprimer les images inutilisées
    docker image prune -f --filter "dangling=true"

    # Supprimer les volumes inutilisés (attention aux données)
    # docker volume prune -f

    log "✅ Nettoyage terminé"
}

# Fonction de status
show_status() {
    log "📊 Status des services:"
    
    cd "$PROJECT_DIR"
    
    echo ""
    docker compose ps
    
    echo ""
    log "📋 Logs récents:"
    docker compose logs --tail=10
    
    echo ""
    log "🌐 URLs:"
    echo "  - Site: https://$DOMAIN"
    echo "  - API: https://$DOMAIN/api/health"
}

# Fonction principale
main() {
    log "🚀 Début du déploiement de MakeMeLearn"

    check_requirements
    backup_current
    update_code
    deploy_containers
    verify_deployment
    cleanup
    show_status

    log "🎉 Déploiement terminé avec succès!"
    log "🌐 Site accessible sur: https://$DOMAIN"
    log "🔗 API accessible sur: https://$DOMAIN/api/"
}

# Gestion des signaux pour un arrêt propre
trap 'error "Déploiement interrompu"' INT TERM

# Vérifier les arguments
case "${1:-deploy}" in
    "deploy")
        main "$@"
        ;;
    "status")
        show_status
        ;;
    "logs")
        cd "$PROJECT_DIR"
        docker compose logs -f
        ;;
    "restart")
        cd "$PROJECT_DIR"
        log "Redémarrage des services..."
        docker compose restart
        log "✅ Services redémarrés"
        ;;
    *)
        echo "Usage: $0 [deploy|status|logs|restart]"
        echo "  deploy  - Déployer l'application (défaut)"
        echo "  status  - Afficher le status des services"
        echo "  logs    - Afficher les logs en temps réel"
        echo "  restart - Redémarrer les services"
        exit 1
        ;;
esac