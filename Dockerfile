# Image unique : API Express + site statique + contenu des univers.
FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/creach-t/makemelearn-landing"

RUN apk add --no-cache dumb-init curl

WORKDIR /app/api

# Dépendances d'abord (cache Docker)
COPY api/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Code API + migrations, contenu des univers, site statique
COPY api/src ./src
COPY api/db ./db
COPY data /app/data
COPY index.html robots.txt sitemap.xml /app/public/
COPY pages /app/public/pages
COPY css /app/public/css
COPY js /app/public/js
COPY components /app/public/components
COPY fav /app/public/fav

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 \
    && mkdir -p logs && chown -R nodejs:nodejs /app

ENV NODE_ENV=production \
    PORT=3000 \
    CONTENT_DIR=/app/data \
    STATIC_DIR=/app/public

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fs http://localhost:3000/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
