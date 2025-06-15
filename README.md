# MakeMeLearn - Landing Page & Backend System

Une plateforme complète pour MakeMeLearn, la communauté d'entraide créative entre autodidactes.

## 🚀 Vue d'ensemble

MakeMeLearn est une communauté d'autodidactes créatifs qui s'entraident gratuitement sur des projets non-lucratifs. Ce repository contient :

- **Frontend** : Landing page moderne et responsive
- **Backend API** : Système d'inscription avec PostgreSQL
- **Infrastructure** : Configuration Docker et Traefik
- **Monitoring** : Health checks et analytics

## ✨ Fonctionnalités Complètes

### Frontend
- **Design Modern** : Interface sombre avec gradients et effets visuels
- **Multi-pages** : Site complet avec navigation (Accueil, À propos, FAQ, Contact, etc.)
- **Responsive** : Optimisé pour tous les appareils
- **Animations** : Effets de hover et transitions fluides
- **Performance** : Code optimisé et chargement rapide
- **Accessibilité** : Navigation clavier et bonnes pratiques
- **SEO Ready** : Meta tags, sitemap, robots.txt

### Backend API
- **Inscriptions** : Système complet d'enregistrement d'emails
- **Base de données** : PostgreSQL avec schéma optimisé
- **Sécurité** : Rate limiting, validation, headers sécurisés
- **Monitoring** : Health checks, métriques Prometheus
- **Analytics** : Statistiques détaillées et tracking
- **Logging** : Système de logs complet avec Winston
- **Email** : Préparé pour la vérification d'emails (à implémenter)

### Infrastructure
- **Docker** : Containerisation complète
- **Traefik** : Reverse proxy avec SSL automatique
- **PostgreSQL** : Base de données avec initialisation automatique
- **Nginx** : Serveur web optimisé pour le frontend
- **CORS** : Configuration sécurisée pour API cross-origin

## 🛠️ Technologies

### Frontend
- **HTML5** : Structure sémantique moderne
- **CSS3** : Flexbox, Grid, animations, variables CSS
- **JavaScript ES6+** : Interactions et API integration
- **Google Fonts** : Police Inter pour une typographie moderne

### Backend
- **Node.js** : Runtime JavaScript serveur
- **Express.js** : Framework web rapide et minimaliste
- **PostgreSQL** : Base de données relationnelle robuste
- **Winston** : Système de logging avancé
- **Helmet** : Sécurité HTTP
- **Rate Limiting** : Protection contre les abus

### Infrastructure
- **Docker & Docker Compose** : Containerisation
- **Traefik** : Reverse proxy et load balancer
- **Nginx** : Serveur web haute performance
- **Let's Encrypt** : Certificats SSL automatiques

## 📁 Structure du Projet

```
makemelearn-landing/
├── 🌐 Frontend
│   ├── index.html              # Page d'accueil
│   ├── about.html              # À propos
│   ├── how-it-works.html       # Fonctionnement
│   ├── faq.html                # Questions fréquentes
│   ├── contact.html            # Contact
│   ├── terms.html              # Conditions d'utilisation
│   ├── privacy.html            # Politique de confidentialité
│   ├── style.css               # Styles et animations
│   ├── script.js               # JavaScript avec intégration API
│   ├── sitemap.xml             # Plan du site
│   └── robots.txt              # Instructions moteurs de recherche
├── 🔧 Backend API
│   ├── api/
│   │   ├── Dockerfile          # Image Docker API
│   │   ├── package.json        # Dépendances Node.js
│   │   └── src/
│   │       ├── server.js       # Serveur Express principal
│   │       ├── config/
│   │       │   └── database.js # Configuration PostgreSQL
│   │       ├── routes/
│   │       │   ├── registrations.js # Routes inscriptions
│   │       │   ├── stats.js    # Routes statistiques
│   │       │   └── health.js   # Routes monitoring
│   │       ├── middleware/
│   │       │   ├── errorHandler.js # Gestion d'erreurs
│   │       │   └── requestLogger.js # Logging requêtes
│   │       └── utils/
│   │           └── logger.js   # Système de logs Winston
├── 🗄️ Base de données
│   └── database/
│       └── init.sql            # Initialisation PostgreSQL
├── 🐳 Infrastructure
│   ├── docker-compose.yml      # Configuration services
│   ├── nginx/
│   │   └── nginx.conf          # Configuration Nginx
│   └── .env.example            # Variables d'environnement
├── 📚 Documentation
│   ├── README.md               # Ce fichier
│   └── DEPLOYMENT.md           # Guide de déploiement
└── 🔧 Configuration
    ├── .gitignore              # Fichiers ignorés Git
    └── sitemap.xml             # Plan du site SEO
```

## 🚀 Installation & Déploiement

### Déploiement Rapide avec Docker

```bash
# 1. Cloner le repository
git clone https://github.com/creach-t/makemelearn-landing.git
cd makemelearn-landing

# 2. Configuration
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. Lancement
docker-compose up -d

# 4. Vérification
curl https://makemelearn.fr
curl https://inscription.makemelearn.fr/health
```

### Développement Local

```bash
# Frontend (serveur statique)
python -m http.server 8000
# ou
npx serve .

# Backend (développement)
cd api
npm install
npm run dev

# Base de données locale
docker run -d --name postgres \
  -e POSTGRES_DB=makemelearn \
  -e POSTGRES_USER=makemelearn_user \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 postgres:15-alpine
```

## 🎯 Pages et Contenu

### 🏠 Page d'Accueil (`index.html`)
- Hero section avec proposition de valeur
- Processus en 4 étapes
- Fonctionnalités principales
- Statistiques du marché
- Vision et mission
- **Formulaire d'inscription fonctionnel avec API**

### ℹ️ À Propos (`about.html`)
- Histoire du projet
- Mission et valeurs
- Équipe
- Statistiques clés

### ⚙️ Comment ça marche (`how-it-works.html`)
- Deux types de demandes expliqués
- Processus détaillé étape par étape
- Exemples concrets
- Règles de la communauté

### ❓ FAQ (`faq.html`)
- 12 questions fréquentes
- Réponses détaillées
- Call-to-action vers contact

### 📞 Contact (`contact.html`)
- Formulaire de contact complet
- Informations de contact
- Temps de réponse
- Réseaux sociaux

### 📋 Pages Légales
- **Conditions d'utilisation** : Règles, projets autorisés/interdits
- **Politique de confidentialité** : Conforme RGPD

## 🔗 API Endpoints

### Inscriptions
- `POST /api/registrations` - Créer une inscription
- `GET /api/registrations/verify/:token` - Vérifier un email
- `POST /api/registrations/resend-verification` - Renvoyer vérification
- `DELETE /api/registrations/unsubscribe/:email` - Se désinscrire

### Statistiques
- `GET /api/stats/public` - Statistiques publiques
- `GET /api/stats/growth` - Données de croissance
- `POST /api/stats/track` - Tracker un événement

### Monitoring
- `GET /health` - Health check simple
- `GET /health/detailed` - Health check détaillé
- `GET /health/metrics` - Métriques Prometheus
- `GET /health/readiness` - Readiness probe
- `GET /health/liveness` - Liveness probe

## 🎨 Design System

### Couleurs
- **Primaire** : `#667eea` → `#764ba2` (Gradient)
- **Secondaire** : `#f093fb`
- **Fond** : `#0B1426`
- **Texte** : `#ffffff` avec variations d'opacité

### Typographie
- **Font** : Inter (400, 500, 600, 700, 800, 900)
- **Échelle** : Responsive avec `clamp()`

### Composants
- Cards avec hover effects
- Boutons avec animations
- Formulaires interactifs avec API
- Navigation sticky
- Système de notifications
- Icônes SVG intégrées

## 📱 Responsive Design

- **Mobile** : < 768px
- **Tablet** : 768px - 1024px
- **Desktop** : > 1024px

## ⚡ Optimisations

### Performance Frontend
- CSS organisé et modulaire
- JavaScript avec API moderne (Fetch)
- Images SVG optimisées
- Chargement différé des animations
- Intersection Observer pour animations

### Performance Backend
- Connection pooling PostgreSQL
- Rate limiting intelligent
- Compression gzip
- Headers de cache optimisés
- Logging asynchrone

### SEO & Accessibilité
- Meta tags descriptifs sur toutes les pages
- Structure HTML sémantique
- Contraste suffisant (WCAG)
- Navigation clavier complète
- Sitemap.xml et robots.txt

## 🔒 Sécurité

### Frontend
- Headers de sécurité (CSP, HSTS, etc.)
- Validation côté client
- Sanitisation des entrées
- Protection XSS

### Backend
- Rate limiting par IP
- Validation avec express-validator
- Headers sécurisés avec Helmet
- Logs de sécurité détaillés
- Protection contre les injections SQL
- Gestion sécurisée des erreurs

## 📊 Analytics & Monitoring

### Tracking Frontend
- Événements utilisateur
- Performance de chargement
- Erreurs JavaScript
- Interactions formulaires

### Monitoring Backend
- Health checks automatiques
- Métriques Prometheus
- Logs structurés avec Winston
- Statistiques de base de données
- Alertes de performance

## 🔧 Configuration

### Variables d'Environnement
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
CORS_ORIGIN=https://makemelearn.fr,https://inscription.makemelearn.fr
POSTGRES_PASSWORD=secure-password
MAINTENANCE_TOKEN=secure-token
```

### Personnalisation Facile
- Couleurs via variables CSS
- Contenu modifiable dans HTML
- Configuration API centralisée
- Paramètres Docker flexibles

## 🚀 Déploiement Production

Consultez le [Guide de Déploiement](DEPLOYMENT.md) pour :
- Configuration DNS et SSL
- Optimisations de sécurité
- Monitoring et alertes
- Sauvegardes automatiques
- Mise à jour continue

## 📈 Roadmap

### Phase 1 (Actuelle) ✅
- [x] Landing page complète
- [x] API d'inscription fonctionnelle
- [x] Base de données PostgreSQL
- [x] Déploiement Docker
- [x] Monitoring de base

### Phase 2 (Prochainement)
- [ ] Vérification d'emails par SMTP
- [ ] Dashboard admin
- [ ] API de contact fonctionnelle
- [ ] Système de newsletter
- [ ] Analytics avancées

### Phase 3 (Futur)
- [ ] Authentification utilisateurs
- [ ] Profils autodidactes
- [ ] Système de projets
- [ ] Messagerie interne
- [ ] Mobile app (PWA)

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/amazing-feature`)
3. Commit les changements (`git commit -m 'Add amazing feature'`)
4. Push la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## 🐛 Support & Issues

- **Issues GitHub** : [Signaler un bug](https://github.com/creach-t/makemelearn-landing/issues)
- **Email** : hello@makemelearn.fr
- **Documentation** : Consultez le [Guide de Déploiement](DEPLOYMENT.md)

## 📝 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 📞 Contact

- **Email** : hello@makemelearn.fr
- **GitHub** : [@creach-t](https://github.com/creach-t)
- **Website** : [makemelearn.fr](https://makemelearn.fr)
- **API** : [inscription.makemelearn.fr](https://inscription.makemelearn.fr)

## 🏆 Statut du Projet

- **Version** : 1.0.0
- **Statut** : Production Ready 🚀
- **Dernière mise à jour** : Juin 2025
- **Tests** : ✅ Frontend | ✅ Backend | ✅ Infrastructure

---

⭐ **Star ce projet si vous l'aimez !**

**Rejoignez la communauté MakeMeLearn et apprenons ensemble !** 🚀

![MakeMeLearn Architecture](https://via.placeholder.com/800x400/0B1426/667eea?text=MakeMeLearn+Full+Stack+Architecture)