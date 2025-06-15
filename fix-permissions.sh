#!/bin/bash

# 🚀 Fix Permissions MakeMeLearn - Déploiement immédiat
# Ce script corrige les permissions et redémarre l'API immédiatement

echo "🚀 Fix permissions et redémarrage MakeMeLearn API..."
echo "================================================="

# Variables
PROJECT_DIR="$HOME/projects/makemelearn-landing"
DATE=$(date +%Y%m%d_%H%M%S)

# Vérifier qu'on est dans le bon dossier
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Erreur: docker-compose.yml non trouvé"
    echo "📁 Naviguez vers le dossier du projet:"
    echo "   cd $PROJECT_DIR"
    exit 1
fi

echo "✅ Dossier projet détecté: $(pwd)"

# 1. Arrêter les services actuels
echo ""
echo "⏹️ Arrêt des services actuels..."
timeout 30 docker compose down --remove-orphans 2>/dev/null || {
    echo "⚠️ Arrêt forcé des containers..."
    docker compose kill 2>/dev/null || true
    docker compose rm -f 2>/dev/null || true
}

# 2. Créer les dossiers nécessaires
echo ""
echo "📁 Création des dossiers avec permissions..."
mkdir -p logs
chmod 755 logs
echo "✅ Dossier logs créé avec permissions 755"

# 3. Vérifier le fichier .env
echo ""
echo "🔧 Vérification du fichier .env..."
if [ ! -f ".env" ]; then
    echo "⚠️ Fichier .env manquant, copie depuis l'exemple..."
    cp .env.example .env
    echo "🔧 IMPORTANT: Configurez DATABASE_URL dans .env avec votre base externe!"
    echo "   Exemple: DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/db"
else
    echo "✅ Fichier .env existe"
    
    # Vérifier la configuration DATABASE_URL
    if grep -q "@postgres:" .env; then
        echo "⚠️ ATTENTION: DATABASE_URL pointe vers @postgres: (container inexistant)"
        echo "🔧 Corrigez DATABASE_URL dans .env pour pointer vers votre base externe"
        echo "   Exemple: DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/db"
    fi
fi

# 4. Mettre à jour depuis Git (optionnel)
echo ""
echo "📥 Mise à jour du code depuis Git..."
git stash --include-untracked 2>/dev/null || true
git fetch origin main 2>/dev/null || echo "⚠️ Git fetch failed, continuing..."
git reset --hard origin/main 2>/dev/null || echo "⚠️ Git reset failed, using local version"

# 5. Créer le network si nécessaire
echo ""
echo "🌐 Vérification du network Traefik..."
docker network create traefik-public 2>/dev/null || echo "ℹ️ Network traefik-public existe déjà"

# 6. Nettoyer les anciennes images
echo ""
echo "🧹 Nettoyage des images obsolètes..."
docker image prune -f 2>/dev/null || true

# 7. Reconstruire et démarrer les services
echo ""
echo "🏗️ Reconstruction et démarrage des services..."

# Build avec --no-cache pour l'API pour forcer la prise en compte du fix
echo "🔨 Build de l'API (avec fix permissions)..."
docker compose build --no-cache api

echo "🔨 Build du frontend..."
docker compose build frontend

# Démarrer les services
echo "▶️ Démarrage des services..."
docker compose up -d

# 8. Attendre et tester
echo ""
echo "⏳ Attente que l'API démarre..."

# Fonction de test avec retry
test_api() {
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s -m 5 "http://localhost:3000/health" >/dev/null 2>&1; then
            echo "✅ API prête ! (tentative $attempt)"
            return 0
        fi
        echo "⏳ API pas encore prête (tentative $attempt/$max_attempts)..."
        sleep 2
        ((attempt++))
    done
    echo "❌ API n'a pas démarré dans les temps"
    return 1
}

# Test de l'API
if test_api; then
    echo ""
    echo "🎉 SUCCESS! L'API fonctionne maintenant!"
    echo "======================================"
    echo ""
    echo "📊 État des services:"
    docker compose ps
    echo ""
    echo "🌐 Tests des URLs:"
    echo "- Site: https://makemelearn.fr"
    echo "- API Health: https://makemelearn.fr/api/health"
    echo "- API Stats: https://makemelearn.fr/api/stats/public"
    echo ""
    echo "📋 Logs récents de l'API:"
    docker compose logs api --tail 10
    echo ""
    echo "✅ Fix terminé avec succès!"
    
else
    echo ""
    echo "❌ L'API n'a pas pu démarrer"
    echo "============================"
    echo ""
    echo "📋 Logs de debug de l'API:"
    docker compose logs api --tail 30
    echo ""
    echo "🔧 Actions de debug:"
    echo "1. Vérifiez votre fichier .env:"
    echo "   cat .env | grep DATABASE_URL"
    echo ""
    echo "2. Testez la connexion DB:"
    echo "   docker exec makemelearn_api node -e 'require(\"./src/config/database\").testConnection()'"
    echo ""
    echo "3. Vérifiez les containers:"
    echo "   docker compose ps"
    echo "   docker compose logs api"
    
    exit 1
fi

echo ""
echo "🚀 Votre API devrait maintenant être accessible !"
echo "📧 Plus de problème d'inscription sur votre site !"