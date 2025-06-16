# Backend API pour MakeMeLearn

Ce dossier contient les exemples d'implémentation des endpoints API nécessaires pour faire fonctionner la landing page MakeMeLearn.

## 🚀 Endpoints Requis

### 1. `/api/registrations` (POST)
**Fonctionnel** - Inscription à la newsletter
- Reçoit l'email et les métadonnées
- Stocke en base de données
- Envoie email de confirmation

### 2. `/api/contact` (POST) 
**Nouveau** - Formulaire de contact avec envoi d'email
- Reçoit les données du formulaire
- Envoie l'email à l'équipe MakeMeLearn
- Retourne confirmation d'envoi

### 3. `/api/stats/track` (POST)
**Analytics** - Tracking des événements
- Reçoit les événements utilisateur
- Stocke pour analytics

## 🔧 Installation Backend

### Prérequis
```bash
npm install express cors helmet nodemailer dotenv rate-limiter-flexible validator
```

### Variables d'environnement (.env)
```env
# API Configuration
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://creach-t.github.io

# Database
DATABASE_URL=your_database_url

# Email Configuration (choisir un fournisseur)
EMAIL_PROVIDER=sendgrid  # ou 'nodemailer', 'mailgun', etc.

# SendGrid (recommandé)
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=hello@makemelearn.fr

# Ou Gmail/SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Rate Limiting
RATE_LIMIT_CONTACT=5  # 5 messages par heure par IP
RATE_LIMIT_SIGNUP=10  # 10 inscriptions par heure par IP
```

## 📧 Configuration Email

### Option 1: SendGrid (Recommandé)
```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail(data) {
  const msg = {
    to: 'hello@makemelearn.fr',
    from: process.env.FROM_EMAIL,
    subject: `[Contact] ${data.subject}`,
    html: generateEmailTemplate(data)
  };
  
  await sgMail.send(msg);
}
```

### Option 2: Gmail/SMTP
```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmail(data) {
  await transporter.sendMail({
    from: `"${data.name}" <${data.email}>`,
    to: 'hello@makemelearn.fr',
    subject: `[Contact] ${data.subject}`,
    html: generateEmailTemplate(data)
  });
}
```

## 🔒 Sécurité Implémentée

- **Rate Limiting**: Protection contre le spam
- **CORS**: Seuls les domaines autorisés peuvent appeler l'API
- **Validation**: Validation stricte des données entrantes
- **Sanitization**: Nettoyage des données pour éviter XSS
- **Helmet**: Headers de sécurité
- **Error Handling**: Gestion d'erreurs robuste

## 📊 Analytics

L'API track automatiquement :
- Inscriptions newsletter
- Soumissions de formulaire de contact
- Événements utilisateur (clics, vues de sections)
- Erreurs JavaScript
- Performance de chargement

## 🚀 Déploiement

### Option 1: Vercel (Recommandé)
```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel --prod
```

### Option 2: Railway
```bash
# Connecter le repo GitHub
# Variables d'environnement via interface web
```

### Option 3: Heroku
```bash
heroku create makemelearn-api
heroku config:set SENDGRID_API_KEY=your_key
git push heroku main
```

## 📝 Template Email

Template HTML professionnel pour les emails de contact :

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Nouveau message de contact</title>
    <style>
        body { font-family: Inter, Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(120deg, #667eea, #764ba2); color: white; padding: 20px; }
        .content { padding: 20px; background: #f8f9fa; }
        .footer { padding: 10px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>MakeMeLearn - Nouveau message</h2>
        </div>
        <div class="content">
            <!-- Contenu dynamique -->
        </div>
    </div>
</body>
</html>
```