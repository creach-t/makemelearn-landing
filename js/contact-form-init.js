/**
 * MakeMeLearn Landing Page - Contact Form Init
 * Patch pour initialiser le formulaire de contact avec les bons IDs
 */

// Import du module de configuration du formulaire de contact
import('../components/form/contact-form.js')
  .then(module => {
    // Initialiser le formulaire de contact si le conteneur existe
    if (document.getElementById('contactForm')) {
      module.initContactForm();
    }
  })
  .catch(error => {
    console.warn('Contact form module not available:', error);
    
    // Fallback : créer le formulaire directement dans le DOM pour les tests
    createFallbackContactForm();
  });

// Fonction de fallback pour créer le formulaire directement
function createFallbackContactForm() {
  const container = document.getElementById('contactForm');
  if (!container) return;

  container.innerHTML = `
    <form class="contact-form" id="contactFormElement">
      <div class="form-group">
        <label for="name">Nom</label>
        <input type="text" id="name" name="name" required>
      </div>
      
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>
      </div>
      
      <div class="form-group">
        <label for="subject">Sujet</label>
        <select id="subject" name="subject" required>
          <option value="">Choisissez un sujet</option>
          <option value="question">Question générale</option>
          <option value="suggestion">Suggestion d'amélioration</option>
          <option value="partenariat">Partenariat</option>
          <option value="probleme">Signaler un problème</option>
          <option value="presse">Demande presse</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="message">Message</label>
        <textarea id="message" name="message" rows="6" required placeholder="Décrivez votre demande..."></textarea>
      </div>
      
      <button type="submit" class="btn btn-primary">
        <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
        </svg>
        Envoyer le message
      </button>
    </form>
  `;

  // Ajouter la gestion du formulaire
  const form = container.querySelector('form');
  if (form) {
    form.addEventListener('submit', handleContactFormSubmit);
  }
}

// Gestion de soumission du formulaire
async function handleContactFormSubmit(e) {
  e.preventDefault();
  
  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  
  try {
    // État de chargement
    button.disabled = true;
    button.innerHTML = `
      <svg class="btn-icon animate-spin" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
      </svg>
      Envoi en cours...
    `;
    
    // Configuration API corrigée pour le fallback
    const API_BASE_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:3000' 
      : 'https://makemelearn.fr/api';
    
    const response = await fetch(`${API_BASE_URL}/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Erreur lors de l\'envoi du message');
    }
    
    // État de succès
    button.innerHTML = `
      <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5 9.293 10.793a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" />
      </svg>
      Message envoyé !
    `;
    button.style.background = 'linear-gradient(120deg, #10B981, #059669)';
    
    // Reset après 3 secondes
    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.background = '';
      button.disabled = false;
      form.reset();
    }, 3000);
    
  } catch (error) {
    button.innerHTML = originalText;
    button.disabled = false;
    console.error('Erreur lors de l\'envoi:', error);
    
    // Afficher une erreur à l'utilisateur
    button.innerHTML = `
      <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
      Erreur d'envoi
    `;
    button.style.background = 'linear-gradient(120deg, #EF4444, #DC2626)';
    
    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.background = '';
      button.disabled = false;
    }, 3000);
  }
}

// Auto-initialisation
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('contactForm') && !document.querySelector('#contactForm form')) {
      createFallbackContactForm();
    }
  });
} else {
  if (document.getElementById('contactForm') && !document.querySelector('#contactForm form')) {
    createFallbackContactForm();
  }
}
