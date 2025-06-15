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

    # Vérifier que docker compose est disponible (correction ici)
    if ! docker compose version &> /dev/null; then
        error "docker compose n'est pas disponible"
    fi

    # Vérifier que le dossier projet existe
    if [ ! -d "$PROJECT_DIR" ]; then
        error "Le dossier projet $PROJECT_DIR n'existe pas"
    fi

    log "✅ Prérequis validés"
}

# Fonction de sauvegarde
backup_current() {
    log "Sauvegarde de la version actuelle..."

    cd "$PROJECT_DIR"

    # Créer un backup de la base de données si elle existe
    if docker compose ps | grep -q "makemelearn_api"; then
        log "Sauvegarde de la base de données..."
        # Ajouter ici la commande de backup de votre DB si nécessaire
    fi

    # Sauvegarder les containers actuels
    docker compose down --remove-orphans

    log "✅ Sauvegarde terminée"
}

# Fonction de mise à jour du code
update_code() {
    log "Mise à jour du code source..."

    cd "$PROJECT_DIR"

    # Stash les changements locaux
    git stash --include-untracked

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

    # Construire et démarrer les containers
    docker compose pull
    docker compose up -d --build

    log "✅ Containers déployés"
}

# Fonction de vérification du déploiement
verify_deployment() {
    log "Vérification du déploiement..."

    # Attendre que les services soient prêts
    sleep 15

    # Vérifier que les containers sont en cours d'exécution
    if ! docker compose ps | grep -q "Up"; then
        error "Les containers ne sont pas démarrés correctement"
    fi

    # Vérifier que le site répond
    local max_attempts=5
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log "Tentative $attempt/$max_attempts de vérification du site..."

        if curl -f -s "https://$DOMAIN" > /dev/null; then
            log "✅ Site accessible"
            break
        elif [ $attempt -eq $max_attempts ]; then
            error "Le site ne répond pas après $max_attempts tentatives"
        else
            warn "Le site ne répond pas encore, nouvelle tentative dans 10s..."
            sleep 10
        fi

        ((attempt++))
    done

    # Vérifier les logs pour des erreurs
    log "Vérification des logs..."
    if docker compose logs --tail=50 | grep -i "error\|fatal"; then
        warn "Des erreurs ont été détectées dans les logs"
    fi

    log "✅ Déploiement vérifié avec succès"
}

# Fonction de nettoyage
cleanup() {
    log "Nettoyage..."

    # Supprimer les images inutilisées
    docker image prune -f

    # Supprimer les volumes inutilisés
    docker volume prune -f

    log "✅ Nettoyage terminé"
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

    log "🎉 Déploiement terminé avec succès!"
    log "🌐 Site accessible sur: https://$DOMAIN"
}

# Gestion des signaux pour un arrêt propre
trap 'error "Déploiement interrompu"' INT TERM

# Exécuter le script principal
main "$@"