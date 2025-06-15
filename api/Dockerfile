# Utilisation de Node.js 20 LTS Alpine pour optimiser la taille
FROM node:20-alpine

# Métadonnées
LABEL maintainer="MakeMeLearn Team <hello@makemelearn.fr>"
LABEL description="API Backend pour MakeMeLearn - Gestion des inscriptions"

# Installation des dépendances système nécessaires
RUN apk add --no-cache \
    dumb-init \
    postgresql-client \
    curl

# Création du répertoire de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances
RUN npm install --only=production && \
    npm cache clean --force

# Création d'un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copie du code source
COPY --chown=nodejs:nodejs . .

# AJOUT: Création du dossier logs avec les bonnes permissions
RUN mkdir -p logs && \
    chown -R nodejs:nodejs logs && \
    chmod 755 logs

# Exposition du port
EXPOSE 3000

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3000

# Utilisation de l'utilisateur non-root
USER nodejs

# Script de healthcheck amélioré
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Point d'entrée avec dumb-init pour gérer les signaux
ENTRYPOINT ["dumb-init", "--"]

# Commande par défaut
CMD ["npm", "start"]